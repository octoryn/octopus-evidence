/**
 * octopus-evidence — the shared Evidence primitive for the Octopus stack.
 *
 * Evidence is the root: a canonical, hashable, attributable unit of support that
 * flows between repos. Observe collects it, Blackboard timelines it, Runtime
 * approves on it, Replay reconstructs it, Experience graphs it, Inspect
 * validates it. This package owns the shape and the cryptographic guarantees —
 * canonical hashing, tamper-evident chains, integrity — and nothing else.
 *
 *   Evidence → hash → chain (timeline) → verify
 */

// Canonical hashing (the shared notion of "equal" and "verifiable").
export {
  stableStringify,
  canonicalHash,
  canonicalHmac,
  canonicalEqual,
  cloneJson,
} from "./canonical.js";

// Core contracts.
export type {
  JsonValue,
  Ref,
  Provenance,
  EvidenceKind,
  Evidence,
  ChainLink,
  ChainVerification,
} from "./types.js";

// The Evidence envelope.
export { createEvidence, verifyEvidence } from "./evidence.js";
export type { EvidenceInput, CreateEvidenceOptions } from "./evidence.js";

// The tamper-evident chain (evidence timeline primitive).
export {
  GENESIS_HASH,
  computeLinkHash,
  nextLink,
  buildChain,
  verifyChain,
  chainHead,
} from "./chain.js";
export type { VerifyChainOptions } from "./chain.js";
