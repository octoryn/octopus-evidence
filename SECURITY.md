**English** | [简体中文](SECURITY.zh-CN.md)

# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Report privately via GitHub Security Advisories ("Report a vulnerability" on the
repository's Security tab) or email **security@octopusos.ai**. Include a
description, reproduction steps, and impact. We aim to acknowledge within a few
business days.

## Scope notes

Evidence is a **cryptographic primitive**: it produces canonical hashes, an
integrity hash per evidence, and a tamper-evident hash chain. A few areas are
security-relevant by design:

- **Tamper-*evident* is not tamper-*proof* by default.** An evidence's `id` and
  `integrity` hash, and the chain's link hashes, are, unkeyed, plain SHA-256 over
  public data. **The hash is public**, so an adversary with write access to
  wherever evidence or a chain is stored can edit it *and* recompute a consistent
  hash — the record then verifies while being forged. Unkeyed hashes detect
  *accidental* or *unprivileged* tampering, not a motivated adversary who can also
  rewrite the hash.
- **For forgery resistance, key it.** Pass `integritySecret` to `createEvidence` /
  `verifyEvidence`, and `secret` to `buildChain` / `nextLink` / `verifyChain`
  (via `verifyChain(chain, { secret })`). This switches the hash to a keyed
  **HMAC-SHA-256**. The evidence integrity HMAC covers the **entire** evidence —
  `kind`, `subject`, `actor`, `content`, and `provenance` — so without the secret
  an adversary cannot forge or alter **any** field, including the attribution and
  provenance (the *who / where / when*), not just the payload, even with full
  write access to the store. Verify with the *same* key used to create. **Protect
  and rotate that key** like any signing secret; a rotation re-bases future hashes
  and does not retroactively re-verify old records.
- **Chain tail-truncation is not self-detectable.** A bare chain (keyed *or*
  unkeyed) proves only that it is a self-consistent **prefix**: a valid prefix of a
  valid chain is itself a valid chain, so dropping the newest links — a rollback —
  passes verification undetected. The HMAC key prevents *forging* new links but does
  **not** prevent truncation. Middle edits, deletions, insertions, and reorderings
  *are* still caught. To catch truncation, record the head hash and length out of
  band and pass `expectedHead` / `expectedLength` to `verifyChain` (or compare
  `chainHead(chain)` yourself):
  `verifyChain(chain, { expectedHead, expectedLength })`.
- **Hostile input is rejected, not silently corrupted.** `stableStringify` (the
  encoder under every hash) **throws a `TypeError`** rather than emit a hash for
  anything JSON cannot faithfully round-trip: non-finite numbers (`NaN`,
  `Infinity`), `undefined`, functions, and circular structures. A "successful"
  hash therefore never hides silent data loss. `verifyEvidence` absorbs that throw
  internally: on non-canonicalizable/hostile stored content it returns `false`
  rather than throwing, so it is safe to call in a batch loop over untrusted data.
  Callers that hash attacker-controlled JSON *directly* (via the canonical helpers)
  should still be prepared for the throw (e.g. treat it as a rejected input) rather
  than letting it crash a request path.
- **No network egress, zero dependencies.** Evidence performs no outbound I/O and
  has zero runtime dependencies (hashing uses Node's built-in `node:crypto`).
  Storing evidence, transporting it, and protecting the store and any HMAC keys at
  rest are the operator's (and the consuming repos') responsibility — this package
  computes and verifies; it does not persist or transmit anything.

## Supported versions

This project is pre-1.0; only the latest version receives fixes.
