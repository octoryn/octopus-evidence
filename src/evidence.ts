/**
 * Creating and verifying {@link Evidence}.
 *
 * `createEvidence` stamps a deterministic id (a content-address over the whole
 * evidence) and an integrity hash. With no secret the integrity is an unkeyed
 * SHA-256 — tamper-*evident* (a public hash anyone can recompute). With an
 * `integritySecret` it is a keyed HMAC over the ENTIRE evidence — kind, subject,
 * actor, content, and provenance — so an attacker without the key cannot forge
 * or alter ANY field (including who/where/when) and still verify. Pure and
 * dependency-free; `verifyEvidence` never throws, even on hostile stored data.
 */
import type { Evidence, EvidenceKind, JsonValue, Provenance, Ref } from "./types.js";
import { canonicalHash, canonicalHmac } from "./canonical.js";

const ID_PREFIX = "ev_";

export interface EvidenceInput {
  readonly kind: EvidenceKind;
  readonly subject?: readonly Ref[];
  readonly actor?: Ref;
  readonly content: JsonValue;
  readonly provenance: Provenance;
}

export interface CreateEvidenceOptions {
  /**
   * Key the integrity hash (HMAC) so no field — content, actor, subject, kind,
   * or provenance — can be forged or altered without the secret.
   */
  readonly integritySecret?: string;
}

/** The full evidence tuple that both the id and the integrity hash commit to. */
function tupleOf(fields: {
  kind: EvidenceKind;
  subject: readonly Ref[];
  actor: Ref | null;
  content: JsonValue;
  provenance: Provenance;
}): JsonValue {
  return fields as unknown as JsonValue;
}

/** Build a canonical, hashable {@link Evidence} from its parts. */
export function createEvidence(
  input: EvidenceInput,
  options: CreateEvidenceOptions = {},
): Evidence {
  const subject = input.subject ?? [];
  const tuple = tupleOf({
    kind: input.kind,
    subject,
    actor: input.actor ?? null,
    content: input.content,
    provenance: input.provenance,
  });
  const id = ID_PREFIX + canonicalHash(tuple);
  const integrity =
    options.integritySecret === undefined
      ? canonicalHash(tuple)
      : canonicalHmac(tuple, options.integritySecret);
  return {
    id,
    kind: input.kind,
    subject,
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
    content: input.content,
    provenance: input.provenance,
    integrity,
  };
}

/**
 * Verify an evidence is intact: its id and integrity both recompute from its
 * fields. Verify with the same `integritySecret` used to create it. Returns
 * false on any mismatch (tampering, wrong key) OR if the content is not
 * canonicalizable (hostile/malformed stored data) — it never throws.
 */
export function verifyEvidence(evidence: Evidence, integritySecret?: string): boolean {
  let id: string;
  let integrity: string;
  try {
    const tuple = tupleOf({
      kind: evidence.kind,
      subject: evidence.subject,
      actor: evidence.actor ?? null,
      content: evidence.content,
      provenance: evidence.provenance,
    });
    id = ID_PREFIX + canonicalHash(tuple);
    integrity =
      integritySecret === undefined ? canonicalHash(tuple) : canonicalHmac(tuple, integritySecret);
  } catch {
    return false;
  }
  return evidence.id === id && evidence.integrity === integrity;
}
