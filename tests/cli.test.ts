import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvidence } from "../src/evidence.js";
import { buildChain } from "../src/chain.js";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
    encoding: "utf8",
  });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** Write `data` as JSON to a fresh temp file and return its path (+ its dir). */
function tempJson(data: unknown): { file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "octopus-evidence-cli-"));
  const file = join(dir, "export.json");
  writeFileSync(file, JSON.stringify(data), "utf8");
  return { file, dir };
}

const sampleEvidence = () =>
  createEvidence({
    kind: "test",
    subject: [{ type: "pull_request", id: "octopus-evidence#1" }],
    actor: { type: "agent", id: "ci" },
    content: { passed: true, cases: 42 },
    provenance: { source: "ci", method: "test-run", at: "2026-07-03T00:00:00.000Z" },
  });

test("CLI verifies a valid single evidence (exit 0)", () => {
  const { file, dir } = tempJson(sampleEvidence());
  try {
    const { code, stdout } = runCli(["verify", file]);
    assert.equal(code, 0);
    assert.match(stdout, /Result: VALID/);
    assert.match(stdout, /1\/1 verified/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI fails a content-tampered evidence (exit 1)", () => {
  const ev = sampleEvidence();
  // Same id/integrity, but altered content — no longer recomputes.
  const tampered = { ...ev, content: { passed: false, cases: 42 } };
  const { file, dir } = tempJson(tampered);
  try {
    const { code, stdout } = runCli(["verify", file]);
    assert.equal(code, 1);
    assert.match(stdout, /Result: INVALID/);
    assert.match(stdout, /1 failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI verifies an array of evidence (exit 0)", () => {
  const { file, dir } = tempJson([sampleEvidence(), sampleEvidence()]);
  try {
    const { code, stdout } = runCli(["verify", file]);
    assert.equal(code, 0);
    assert.match(stdout, /2\/2 verified/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI verifies a valid chain (exit 0)", () => {
  const chain = buildChain(["a", "b", "c"].map((c) => `hash-${c}`));
  const { file, dir } = tempJson(chain);
  try {
    const { code, stdout } = runCli(["verify", file]);
    assert.equal(code, 0);
    assert.match(stdout, /Chain: ok \(3 links\)/);
    assert.match(stdout, /Result: VALID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI reports a broken/truncated chain (exit 1)", () => {
  const chain = buildChain(["a", "b", "c"].map((c) => `hash-${c}`));
  // Drop the middle link: link 2 now points at a previousHash that is gone.
  const broken = [chain[0]!, chain[2]!];
  const { file, dir } = tempJson(broken);
  try {
    const { code, stdout } = runCli(["verify", file]);
    assert.equal(code, 1);
    assert.match(stdout, /Chain: BROKEN/);
    assert.match(stdout, /Result: INVALID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI verifies a wrapper object with evidence and chain (exit 0)", () => {
  const ev = sampleEvidence();
  const chain = buildChain([ev.id]);
  const { file, dir } = tempJson({ evidence: [ev], chain });
  try {
    const { code, stdout } = runCli(["verify", file]);
    assert.equal(code, 0);
    assert.match(stdout, /1\/1 verified/);
    assert.match(stdout, /Chain: ok/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI honours --secret for keyed (HMAC) evidence", () => {
  const secret = "s3cr3t";
  const ev = createEvidence(
    {
      kind: "review",
      content: { verdict: "approve" },
      provenance: { source: "human", at: "2026-07-03T00:00:00.000Z" },
    },
    { integritySecret: secret },
  );
  const { file, dir } = tempJson(ev);
  try {
    // Wrong/absent secret → fails.
    assert.equal(runCli(["verify", file]).code, 1);
    // Correct secret → passes.
    const { code, stdout } = runCli(["verify", file, "--secret", secret]);
    assert.equal(code, 0);
    assert.match(stdout, /Result: VALID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --format json emits a machine-readable report", () => {
  const { file, dir } = tempJson(sampleEvidence());
  try {
    const { code, stdout } = runCli(["verify", file, "--format", "json"]);
    assert.equal(code, 0);
    const report = JSON.parse(stdout) as { ok: boolean; evidence: { verified: number } };
    assert.equal(report.ok, true);
    assert.equal(report.evidence.verified, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI --help exits 0 and prints usage", () => {
  const { code, stdout } = runCli(["--help"]);
  assert.equal(code, 0);
  assert.ok(stdout.includes("octopus-evidence"));
  assert.ok(stdout.includes("Usage:"));
});

test("CLI --version exits 0 and prints a version", () => {
  const { code, stdout } = runCli(["--version"]);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("CLI exits 2 on a missing file", () => {
  const { code, stderr } = runCli(["verify", "/no/such/file-xyz.json"]);
  assert.equal(code, 2);
  assert.match(stderr, /cannot read/);
});

test("CLI exits 2 on an unknown option", () => {
  const { code, stderr } = runCli(["verify", "x.json", "--nope"]);
  assert.equal(code, 2);
  assert.match(stderr, /unknown option/);
});

test("CLI exits 2 when the file has no evidence or chain", () => {
  // A bare JSON primitive classifies to neither evidence nor chain.
  const { file, dir } = tempJson(42);
  try {
    const { code, stderr } = runCli(["verify", file]);
    assert.equal(code, 2);
    assert.match(stderr, /no evidence or chain/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI handles a hostile null link in a wrapper chain (exit 1, no crash)", () => {
  // Regression: {chain:[null]} used to crash verifyChain with an uncaught
  // TypeError (exit 1 + stack trace). It must now be a clean INVALID verdict.
  const chain = buildChain(["aa", "bb"]);
  const poisoned = { chain: [chain[0], null, chain[1]] };
  const { file, dir } = tempJson(poisoned);
  try {
    const { code, stdout, stderr } = runCli(["verify", file]);
    assert.equal(code, 1);
    assert.match(stdout, /Result: INVALID/);
    assert.match(stdout, /Chain: BROKEN/);
    assert.doesNotMatch(stderr, /TypeError|at Object|node:internal/); // no raw stack trace
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
