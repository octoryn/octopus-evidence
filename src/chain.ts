/**
 * A tamper-evident, append-only hash chain — the "evidence timeline" primitive.
 *
 * Each link commits a content hash and the previous link's hash, so any edit,
 * insertion, deletion of an *earlier* link, or reordering breaks verification.
 * This is the exact scheme octopus-observe's audit trail uses, generalized so
 * Blackboard's timeline and anything else can share one verifier. Unkeyed it is
 * tamper-*evident* (the hash is public); pass a `secret` for a keyed HMAC chain
 * that can't be forged without the key.
 *
 * Completeness caveat: a bare chain proves only that it is a self-consistent
 * *prefix* — a valid prefix of a valid chain is itself a valid chain, so **tail
 * truncation / rollback is not self-detectable**. To catch it, record the head
 * hash and length out of band and pass `expectedHead` / `expectedLength` to
 * {@link verifyChain} (or compare {@link chainHead} yourself).
 */
import type { ChainLink, ChainVerification } from "./types.js";
import { canonicalHash, canonicalHmac } from "./canonical.js";

/** The previousHash of the first link (and the head of an empty chain). */
export const GENESIS_HASH = "0".repeat(64);

/** Hash binding a link's position, its predecessor, and its committed content. */
export function computeLinkHash(
  sequence: number,
  previousHash: string,
  contentHash: string,
  secret?: string,
): string {
  const preimage = [sequence, previousHash, contentHash];
  return secret === undefined ? canonicalHash(preimage) : canonicalHmac(preimage, secret);
}

/**
 * Compute the next link that commits `contentHash` after `chain`. Pure: it
 * returns the new link without mutating `chain` (append it yourself).
 */
export function nextLink(
  chain: readonly ChainLink[],
  contentHash: string,
  secret?: string,
): ChainLink {
  const sequence = chain.length;
  const previousHash = sequence === 0 ? GENESIS_HASH : chain[sequence - 1]!.hash;
  return {
    sequence,
    previousHash,
    contentHash,
    hash: computeLinkHash(sequence, previousHash, contentHash, secret),
  };
}

/** Build a full chain from an ordered list of content hashes. */
export function buildChain(contentHashes: readonly string[], secret?: string): ChainLink[] {
  const chain: ChainLink[] = [];
  for (const contentHash of contentHashes) chain.push(nextLink(chain, contentHash, secret));
  return chain;
}

/** The head (latest link's hash) of a chain, or `GENESIS_HASH` if empty. */
export function chainHead(chain: readonly ChainLink[]): string {
  return chain.length === 0 ? GENESIS_HASH : chain[chain.length - 1]!.hash;
}

export interface VerifyChainOptions {
  /** The HMAC key the chain was built with, if any. */
  readonly secret?: string;
  /** Expected total link count — set it to detect tail truncation. */
  readonly expectedLength?: number;
  /** Expected head hash (see {@link chainHead}) — set it to detect rollback. */
  readonly expectedHead?: string;
}

/**
 * Verify a chain: contiguous 0-based sequences, correct linkage to the previous
 * hash, and each `hash` recomputed from its parts — plus, when supplied,
 * `expectedLength` / `expectedHead` to catch tail truncation. Returns the first
 * break, if any. Verify with the same `secret` used to build it.
 *
 * Like {@link verifyEvidence}, this **never throws on hostile data**: a link
 * that is not a well-formed object (e.g. a `null` smuggled into a decoded JSON
 * export) is reported as the first break, not dereferenced.
 */
export function verifyChain(
  chain: readonly ChainLink[],
  options: VerifyChainOptions = {},
): ChainVerification {
  const { secret, expectedLength, expectedHead } = options;
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const link = chain[i]!;
    if (link === null || typeof link !== "object") {
      return {
        ok: false,
        brokenAt: i,
        reason: `malformed link at ${i} (not a chain-link object)`,
      };
    }
    if (link.sequence !== i) {
      return {
        ok: false,
        brokenAt: i,
        reason: `sequence out of order: expected ${i}, got ${link.sequence}`,
      };
    }
    if (link.previousHash !== previousHash) {
      return {
        ok: false,
        brokenAt: i,
        reason: `previousHash mismatch at link ${i} (chain broken or reordered)`,
      };
    }
    const expected = computeLinkHash(link.sequence, link.previousHash, link.contentHash, secret);
    if (link.hash !== expected) {
      return {
        ok: false,
        brokenAt: i,
        reason: `hash mismatch at link ${i} (content or link tampered)`,
      };
    }
    previousHash = link.hash;
  }
  if (expectedLength !== undefined && chain.length !== expectedLength) {
    return {
      ok: false,
      brokenAt: Math.min(chain.length, expectedLength),
      reason: `chain length ${chain.length} != expected ${expectedLength} (possible truncation)`,
    };
  }
  if (expectedHead !== undefined && chainHead(chain) !== expectedHead) {
    return {
      ok: false,
      brokenAt: chain.length === 0 ? 0 : chain.length - 1,
      reason: `head hash mismatch (possible truncation or rollback)`,
    };
  }
  return { ok: true };
}
