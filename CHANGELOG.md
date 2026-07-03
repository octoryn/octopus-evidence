**English** | [简体中文](CHANGELOG.zh-CN.md)

# Changelog

All notable changes to Evidence are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
semantic versioning once it reaches 1.0.

## [0.1.0] - 2026-07-03

First public release. The shared **Evidence** primitive for the Octopus stack —
a canonical, hashable, tamper-evident unit of *support* that flows between repos.
**Zero runtime dependencies** (Node built-ins only).

### Added

- **The Evidence envelope.** `createEvidence` stamps a canonical, hashable
  `Evidence` with a deterministic `id` and an `integrity` hash — **both computed
  over the whole evidence** (`kind`, `subject`, `actor?`, `content`, `provenance`).
  It is **idempotent** (identical inputs → identical evidence) and
  **content-addressed** (different content, actor, or provenance → different id).
  `verifyEvidence` returns `false` if **any** field was edited, and it **never
  throws** — on non-canonicalizable/hostile stored content it returns `false`, so
  it is safe to call in a batch loop over untrusted data. Pass an `integritySecret`
  for a keyed HMAC that is tamper-*proof*, not just tamper-*evident*; because the
  HMAC covers the entire evidence, an attacker without the key cannot forge or
  alter *any* field — including the attribution and provenance (who/where/when),
  not just the payload. Integrity is computed internally; there is no standalone
  integrity function in the public API.
- **The tamper-evident hash chain** (the "evidence timeline" primitive):
  `buildChain` builds an append-only chain from an ordered list of content hashes,
  `nextLink` computes the next link purely (returns it without mutating the chain),
  and `verifyChain(chain, options?)` checks contiguous sequences, correct linkage,
  and each recomputed link hash — returning the first break
  (`{ ok: false, brokenAt, reason }`). `GENESIS_HASH` is the first link's
  `previousHash`; `computeLinkHash`, `chainHead` (the latest link's hash, or
  `GENESIS_HASH` if empty), and the `VerifyChainOptions` type are exported. Any
  edit, insertion, deletion, or reordering of *earlier* links breaks verification.
  Pass `{ secret }` to `verifyChain` (and a `secret` to `buildChain` / `nextLink`)
  for a keyed HMAC chain whose links cannot be forged without the key. **Tail
  truncation caveat:** a bare chain proves only that it is a self-consistent
  *prefix*, so rollback of the newest links is not self-detectable — an HMAC key
  prevents forging new links but not truncation. Pass `expectedHead` /
  `expectedLength` to `verifyChain` (anchoring `chainHead(chain)` and the length
  out of band) to catch it.
- **Canonical hashing** (the shared foundation): `stableStringify` emits
  deterministic JSON with object keys sorted at every depth, serializes sparse
  array holes as `null`, and **rejects** what JSON cannot faithfully round-trip
  (non-finite numbers, `undefined`, functions, cycles) with a `TypeError` so a
  "successful" hash never hides silent data loss. `canonicalHash` is the SHA-256 of
  that encoding; `canonicalHmac` is its keyed variant; `canonicalEqual` is deep
  equality via the same encoding; `cloneJson` is a deep clone that also asserts the
  value is canonicalizable JSON.
- **Core contracts:** the `Evidence`, `Ref`, `Provenance`, `EvidenceKind`,
  `ChainLink`, `ChainVerification`, and `JsonValue` types — the frozen shape the
  rest of the stack passes around.
- **Open-source release packaging** to the ecosystem standard: full `package.json`
  metadata (author, repository, homepage, bugs, keywords), bilingual docs (English
  canonical + `*.zh-CN.md` siblings with a language switcher) for the README,
  CHANGELOG, and design doc, README badges, and `SECURITY.md` / `CONTRIBUTING.md` /
  `CODE_OF_CONDUCT.md`.
