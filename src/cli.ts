#!/usr/bin/env node
/**
 * octopus-evidence CLI — verify evidence and chains from a file, no code needed.
 *
 * The "verify without trusting the store" tool: hand an auditor a JSON export
 * and this binary, and they can independently recompute every id, integrity
 * hash, and chain link — proving the export was not tampered with, without
 * running (or trusting) whatever store produced it.
 *
 *   octopus-evidence verify <file>                      Verify a JSON export
 *   octopus-evidence verify export.json --secret $KEY   Keyed (HMAC) verify
 *   octopus-evidence verify export.json --format json   Machine-readable report
 *
 * The file may contain ANY of these shapes (auto-detected):
 *   - a single Evidence object
 *   - an array of Evidence
 *   - a bare array of ChainLink
 *   - an object with `evidence` (array or single) and/or `chain` (array)
 *
 * Exit codes: 0 everything valid, 1 any evidence/chain invalid, 2 usage/IO/parse.
 */
import { readFileSync } from "node:fs";
import { verifyEvidence } from "./evidence.js";
import { verifyChain } from "./chain.js";
import type { ChainVerification, Evidence, ChainLink } from "./types.js";

const USAGE = `octopus-evidence — verify evidence and chains from a file, no code needed

Usage:
  octopus-evidence verify <file>     Verify a JSON export of evidence and/or a chain

Options:
  --secret <s>      HMAC key the evidence/chain were sealed with (omit if unkeyed)
  --format <f>      Output format: pretty | json   (default pretty)
  --version         Print version and exit
  --help            Show this help

The file may contain a single Evidence, an array of Evidence, a bare array of
ChainLink, or an object with an "evidence" and/or "chain" array. The shape is
auto-detected.

Exit codes: 0 everything valid, 1 any evidence/chain invalid, 2 usage/IO/parse error.`;

interface CliArgs {
  command?: string;
  file?: string;
  secret?: string;
  format: "pretty" | "json";
  help: boolean;
  version: boolean;
  error?: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { format: "pretty", help: false, version: false };
  const tokens = [...argv];
  const positional: string[] = [];
  while (tokens.length > 0) {
    const raw = tokens.shift()!;
    let flag = raw;
    let inlineValue: string | undefined;
    const eq = raw.indexOf("=");
    if (raw.startsWith("--") && eq !== -1) {
      flag = raw.slice(0, eq);
      inlineValue = raw.slice(eq + 1);
    }
    const takeValue = (): string | undefined => inlineValue ?? tokens.shift();
    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--secret": {
        const v = takeValue();
        if (v === undefined) args.error = "--secret requires a value";
        else args.secret = v;
        break;
      }
      case "--format":
      case "-f": {
        const v = takeValue();
        if (v !== "pretty" && v !== "json") {
          args.error = `invalid --format "${v ?? ""}" (want pretty|json)`;
        } else args.format = v;
        break;
      }
      default:
        if (flag.startsWith("-")) args.error = `unknown option "${flag}"`;
        else positional.push(raw);
    }
  }
  if (positional[0] !== undefined) args.command = positional[0];
  if (positional[1] !== undefined) args.file = positional[1];
  return args;
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** A minimally-typed guard: is this a plausible object (not null, not array)? */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Does this object have the four hash fields every {@link ChainLink} carries? */
function looksLikeChainLink(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value["sequence"] === "number" &&
    typeof value["previousHash"] === "string" &&
    typeof value["contentHash"] === "string" &&
    typeof value["hash"] === "string"
  );
}

interface Parsed {
  readonly evidence: readonly Evidence[];
  readonly chain: readonly ChainLink[] | undefined;
}

/**
 * Robustly detect the shape of a parsed JSON document and split it into the
 * evidence list and (optional) chain. Never throws on odd shapes — anything it
 * cannot classify becomes an empty result, which the report renders as such.
 */
function classify(doc: unknown): Parsed {
  // An explicit wrapper object: { evidence?, chain? }.
  if (isObject(doc) && ("evidence" in doc || "chain" in doc)) {
    const rawEvidence = doc["evidence"];
    const evidence = Array.isArray(rawEvidence)
      ? (rawEvidence as Evidence[])
      : rawEvidence !== undefined
        ? [rawEvidence as Evidence]
        : [];
    const rawChain = doc["chain"];
    const chain = Array.isArray(rawChain) ? (rawChain as ChainLink[]) : undefined;
    return { evidence, chain };
  }
  // A bare array: a chain if the elements look like links, else evidence.
  if (Array.isArray(doc)) {
    if (doc.length > 0 && doc.every(looksLikeChainLink)) {
      return { evidence: [], chain: doc as ChainLink[] };
    }
    return { evidence: doc as Evidence[], chain: undefined };
  }
  // A single object: a lone chain link, or a lone evidence.
  if (looksLikeChainLink(doc)) return { evidence: [], chain: [doc as ChainLink] };
  if (isObject(doc)) return { evidence: [doc as unknown as Evidence], chain: undefined };
  return { evidence: [], chain: undefined };
}

interface EvidenceResult {
  readonly index: number;
  readonly id: unknown;
  readonly ok: boolean;
}

interface Report {
  readonly evidence: {
    readonly total: number;
    readonly verified: number;
    readonly failed: number;
    readonly results: readonly EvidenceResult[];
  };
  readonly chain: { readonly present: boolean; readonly length: number } & (
    | { readonly present: false }
    | ({ readonly present: true; readonly length: number } & ChainVerification)
  );
  readonly ok: boolean;
}

function buildReport(parsed: Parsed, secret: string | undefined): Report {
  const results: EvidenceResult[] = parsed.evidence.map((ev, index) => ({
    index,
    id: isObject(ev) ? ev["id"] : undefined,
    ok: verifyEvidence(ev, secret),
  }));
  const verified = results.filter((r) => r.ok).length;
  const failed = results.length - verified;

  let chainReport: Report["chain"];
  let chainOk = true;
  if (parsed.chain === undefined) {
    chainReport = { present: false, length: 0 };
  } else {
    const verification = verifyChain(parsed.chain, secret === undefined ? {} : { secret });
    chainOk = verification.ok;
    chainReport = { present: true, length: parsed.chain.length, ...verification };
  }

  return {
    evidence: { total: results.length, verified, failed, results },
    chain: chainReport,
    ok: failed === 0 && chainOk,
  };
}

function formatPretty(report: Report): string {
  const lines: string[] = [];
  const { evidence, chain } = report;
  if (evidence.total > 0) {
    lines.push(
      `Evidence: ${evidence.verified}/${evidence.total} verified, ${evidence.failed} failed`,
    );
    for (const r of evidence.results) {
      if (!r.ok) {
        const id = typeof r.id === "string" ? r.id : "(no id)";
        lines.push(`  ✗ [${r.index}] ${id} — integrity/id mismatch (tampered or wrong secret)`);
      }
    }
  } else {
    lines.push("Evidence: none in file");
  }

  if (chain.present) {
    if (chain.ok) {
      lines.push(`Chain: ok (${chain.length} link${chain.length === 1 ? "" : "s"})`);
    } else {
      lines.push(`Chain: BROKEN at link ${chain.brokenAt} — ${chain.reason}`);
    }
  } else {
    lines.push("Chain: none in file");
  }

  lines.push("");
  lines.push(report.ok ? "Result: VALID" : "Result: INVALID");
  return lines.join("\n");
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (args.error !== undefined) {
    process.stderr.write(`error: ${args.error}\n\n${USAGE}\n`);
    return 2;
  }
  if (args.command !== "verify") {
    const what =
      args.command === undefined ? "missing command" : `unknown command "${args.command}"`;
    process.stderr.write(`error: ${what} (expected "verify")\n\n${USAGE}\n`);
    return 2;
  }
  if (args.file === undefined) {
    process.stderr.write(`error: verify requires a <file> argument\n\n${USAGE}\n`);
    return 2;
  }

  let raw: string;
  try {
    raw = readFileSync(args.file, "utf8");
  } catch (cause) {
    process.stderr.write(`error: cannot read "${args.file}": ${(cause as Error).message}\n`);
    return 2;
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (cause) {
    process.stderr.write(`error: "${args.file}" is not valid JSON: ${(cause as Error).message}\n`);
    return 2;
  }

  const parsed = classify(doc);
  if (parsed.evidence.length === 0 && parsed.chain === undefined) {
    process.stderr.write(`error: "${args.file}" contains no evidence or chain to verify\n`);
    return 2;
  }

  const report = buildReport(parsed, args.secret);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatPretty(report)}\n`);
  }
  return report.ok ? 0 : 1;
}

process.exit(main());
