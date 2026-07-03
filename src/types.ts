/**
 * Core contracts for octopus-evidence.
 *
 * An {@link Evidence} is the atom the whole Octopus stack passes around: a
 * canonical, hashable, attributable unit of *support* for a claim — a commit, a
 * test result, a review, an observation, a transcript. Observe collects it,
 * Blackboard timelines it, Runtime approves on it, Replay reconstructs it,
 * Experience graphs it, Inspect validates it. This package owns the shape and
 * the cryptographic guarantees; it derives nothing and orchestrates nothing.
 */
import type { JsonValue } from "./canonical.js";

export type { JsonValue } from "./canonical.js";

/** A tagged reference to something evidence is about or attributed to. */
export interface Ref {
  readonly type: string;
  readonly id: string;
}

/** Where a piece of evidence came from. */
export interface Provenance {
  /** The producing system/connector, e.g. `"github"`, `"ci"`, `"observe"`. */
  readonly source: string;
  /** How it was produced, e.g. `"webhook"`, `"test-run"`, `"human"`. */
  readonly method?: string;
  /** RFC 3339 timestamp of production. */
  readonly at: string;
}

/**
 * Open kind vocabulary — evidence is not limited to a fixed enum. Common kinds:
 * `observation`, `commit`, `test`, `benchmark`, `review`, `attestation`,
 * `decision`, `transcript`, `citation`.
 */
export type EvidenceKind = string;

/** A canonical, hashable unit of evidence. */
export interface Evidence {
  /** Deterministic id: a hash of (kind, subject, actor?, content, provenance). */
  readonly id: string;
  readonly kind: EvidenceKind;
  /** What this is evidence *about* (may be empty). */
  readonly subject: readonly Ref[];
  /** Who/what produced or is attributed by this evidence. */
  readonly actor?: Ref;
  /** The payload — the actual evidentiary content. */
  readonly content: JsonValue;
  readonly provenance: Provenance;
  /**
   * Integrity hash over the content (canonical SHA-256, or a keyed HMAC when an
   * integrity secret is supplied). Detects after-the-fact tampering of the
   * stored content independently of the `id`.
   */
  readonly integrity: string;
}

/** One link in a tamper-evident hash chain (the "evidence timeline" primitive). */
export interface ChainLink {
  /** 0-based position in the chain. */
  readonly sequence: number;
  /** Hash of the previous link (`GENESIS_HASH` for the first). */
  readonly previousHash: string;
  /** Hash of the payload this link commits (e.g. an Evidence `id` or content hash). */
  readonly contentHash: string;
  /** Hash binding `sequence` + `previousHash` + `contentHash` (+ optional secret). */
  readonly hash: string;
}

/** Result of verifying a chain. */
export type ChainVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly brokenAt: number; readonly reason: string };
