**English** | [简体中文](DESIGN.zh-CN.md)

# Evidence — Architecture & Contracts

Status: **v0.1** · Owner: Evidence · Last updated: 2026-07-03

This is the authoritative design document. Code is written *against* this spec.
When the two disagree, this document is wrong until updated — fix it here first,
then change the code.

---

## 1. What Evidence is

**Evidence is the root category.** Governance needs evidence. Compliance needs
evidence. Audit needs evidence. Every one of those systems is *about* deciding,
attesting, or defending on the strength of some underlying support — so the
support itself is one level *below* all of them. This package owns exactly that
level: a canonical, hashable, attributable, tamper-evident unit of *support* for
a claim — a commit, a test result, a review, an observation, a transcript, a
citation — and the cryptography that makes it trustworthy.

```
Evidence  →  hash  →  chain (timeline)  →  verify
```

An AI system's every defensible claim — "this was approved", "this test passed",
"this decision has a reason" — ultimately rests on a unit of evidence. If that
unit is not canonical (two equal facts might hash differently), not attributable
(no who/what/when), or not tamper-evident (a later edit goes unnoticed), then
every governance, compliance, and audit conclusion built on top inherits that
weakness. Making the *unit* trustworthy is therefore the highest-leverage place
to stand, and it is the only thing this package does.

### 1.1 A primitive, not a system

The single most important framing: **Evidence is a shape and three guarantees,
not a service.** It has no storage, no query, no network, no derivation, no
orchestration. `createEvidence` is a pure function; `verifyEvidence`,
`buildChain`, and `verifyChain` are pure functions; the hashing helpers are pure
functions. Nothing here reaches a database, a socket, or a clock.

If Evidence grew a store, it would compete with the repos whose *job* is storage.
If it grew a query API, it would compete with Blackboard. If it derived causal
graphs, it would compete with Experience. It deliberately does none of that, so
that every repo can depend on the same unit without depending on each other's
machinery. The shape depends on nothing; the systems depend on the shape.

### 1.2 Why this deduplicates the stack

`octopus-observe` and `octopus-replay` each *independently reinvented the same
three things*: canonical JSON serialization, SHA-256 content hashing, and a
tamper-evident hash chain. Two copies of "what does *equal* mean" is one copy too
many — the moment they drift, an observation that Observe considers identical to
another could hash differently in Replay, and a "verifiable" record in one repo
is not verifiable by the other.

Pulling canonical JSON + SHA-256 + the hash chain *here, once* means there is
exactly one definition of "equal" and one definition of "verifiable" in the whole
stack. Every repo that needs to hash a fact, compare two facts, or commit a stream
of facts to a tamper-evident log now shares a single implementation with a single
frozen wire contract — rather than N subtly-different ones.

### 1.3 Independence

Zero dependency on any other Octopus package — and **zero runtime dependencies at
all**. The package builds, tests, and runs with nothing else present; hashing uses
Node's built-in `node:crypto`. The boundary is the `Evidence` / `ChainLink` shape
and the canonical encoding, not any runtime SDK.

---

## 2. The three guarantees

Everything in the package exists to deliver exactly three guarantees. They
compose: canonical is the foundation, the id is built on it, integrity and the
chain are built on both.

### 2.1 Canonical — a shared notion of "equal"

Two values are the same evidence-content iff their **canonical encoding** is
byte-identical. Object key order, whitespace, and number formatting must never
affect that. `stableStringify(value)` emits deterministic JSON with object keys
sorted at *every* depth, so logically-equal values always produce identical text;
`canonicalHash` takes its SHA-256. Two values hash equal iff they are semantically
identical JSON.

This is the load-bearing foundation: without a canonical form, "the same fact"
could hash a dozen different ways depending on serialization accidents, and none
of the guarantees above it would hold. `canonicalEqual(a, b)` is deep equality via
the same encoding, and `cloneJson` is a deep clone that also asserts the value is
canonicalizable — so "equal", "same hash", and "safely stored" are one predicate,
computed by one encoder. There is no second notion of equality anywhere.

`stableStringify` **rejects** what JSON cannot faithfully round-trip — non-finite
numbers, `undefined`, functions, and cycles — with a `TypeError`. A "successful"
hash therefore never hides silent data loss; a hostile or malformed input fails
loudly at the encoder rather than producing a hash of a corrupted value.

### 2.2 Content-addressed, idempotent id

`createEvidence` stamps a deterministic `id`: the `ID_PREFIX` (`"ev_"`) followed
by `canonicalHash` of the evidence's **full tuple** — `kind`, `subject`, `actor`
(null when absent), `content`, and `provenance`. Two consequences follow directly:

- **Idempotent.** Identical inputs always yield the identical evidence. Creating
  "the same" evidence twice — in two processes, on two machines, a year apart —
  produces the same id, so a consumer can dedupe purely on id without coordination.
- **Content-addressed.** Different content, provenance, actor, subject, or kind →
  a different id. The id *is* a fingerprint of the whole tuple; you cannot change
  what the evidence claims or where it came from and keep the same id.

`content` is part of the tuple, so two observations that differ only in payload
are distinct evidence. The `id` and the `integrity` hash (§2.3) commit to the
*same* full tuple — the id addresses it publicly, integrity attests to it
(optionally under a key).

### 2.3 Tamper-evident integrity + chain (HMAC for tamper-proof)

Each `Evidence` also carries an `integrity` hash over its **whole tuple** —
`kind`, `subject`, `actor`, `content`, and `provenance` — a canonical SHA-256, or
a keyed HMAC when an `integritySecret` is supplied. `verifyEvidence` returns `true`
only if **both** hold: the integrity hash recomputes from the stored fields, *and*
the id recomputes from those same fields. So an after-the-fact edit to *any* field
is caught — including a swapped `actor`, `subject`, `kind`, or `provenance`, not
just the `content`. `verifyEvidence` **never throws**: if the stored content is
not canonicalizable (cyclic, non-finite, `undefined` — hostile or corrupted data)
it returns `false`, so it is safe to call in a batch loop over untrusted records.

Because the keyed integrity covers the entire tuple, an HMAC key closes the
attribution-forgery hole: an attacker without the key cannot forge or alter the
*who / where / when* (`actor` / `subject` / `provenance`), not merely the payload.

The **hash chain** extends tamper-evidence from one unit to an *ordered stream*.
`buildChain` links a list of content hashes (typically evidence ids) into an
append-only chain where each link commits its `sequence`, the previous link's
`hash`, and its `contentHash`. `verifyChain` checks contiguous 0-based sequences,
correct linkage, and each recomputed link hash, returning the first break. Because
every link binds its predecessor's hash, **any** edit, insertion, deletion, or
reordering of *earlier* links breaks verification from that point on. A bare chain
proves only that it is a self-consistent *prefix*, so **tail truncation / rollback
of the newest links is not self-detectable** — see §6. `chainHead(chain)` returns
the latest link's hash (or `GENESIS_HASH` if empty); record it plus the length out
of band and pass `expectedHead` / `expectedLength` to `verifyChain` to catch
truncation. This is the primitive an audit trail or a Blackboard timeline is built
from.

**Evident vs. proof.** Unkeyed, all of this is tamper-*evident*, not
tamper-*proof*: the hash is public, so an adversary with write access can edit the
data and recompute a consistent hash. Supplying `integritySecret` (evidence) or
`secret` (chain, via `verifyChain(chain, { secret })`) switches the hashes to keyed
**HMAC-SHA-256** — now an adversary cannot forge a verifying hash without the key
(though on the chain the HMAC still does not prevent *truncation*; §6). See
`SECURITY.md` for the key-management consequences (protect the key, rotate it,
verify with the same key).

---

## 3. Core contracts (`src/types.ts`)

These shapes are the frozen wire contract the rest of the stack passes around.

- **`Evidence`** — `{ id, kind, subject, actor?, content, provenance, integrity }`.
  The canonical, hashable unit. `id` and `integrity` both hash the whole tuple
  (§2.2, §2.3) — `id` is the deterministic content-address, `integrity` the
  (optionally keyed) attestation; `subject` is what it is evidence *about*
  (possibly empty); `actor` is who/what produced or is attributed by it.
- **`Ref`** — `{ type, id }`, a tagged reference used for `subject[]` and `actor`.
- **`Provenance`** — `{ source, method?, at }`: the producing system, how it was
  produced, and an RFC 3339 timestamp of production.
- **`EvidenceKind`** — an *open* `string` vocabulary, not a fixed enum. Common
  kinds: `observation`, `commit`, `test`, `benchmark`, `review`, `attestation`,
  `decision`, `transcript`, `citation`.
- **`ChainLink`** — `{ sequence, previousHash, contentHash, hash }`: one link in
  the tamper-evident chain.
- **`ChainVerification`** — `{ ok: true }` or `{ ok: false, brokenAt, reason }`.
- **`JsonValue`** — the canonicalizable JSON value type; `content` must be one.

An evidence built with an `actor` carries it; omit it and the field is absent from
the object (via `exactOptionalPropertyTypes`), yet the id treats a missing actor as
`null`, so a present-`undefined` and an absent actor produce the *same* id.

---

## 4. Module layout (`src/`)

| Module         | Responsibility |
| -------------- | -------------- |
| `canonical.ts` | The equality/hashing foundation: `stableStringify`, `canonicalHash`, `canonicalHmac`, `canonicalEqual`, `cloneJson`, and the `JsonValue` type. |
| `types.ts`     | Core contracts: `Evidence`, `Ref`, `Provenance`, `EvidenceKind`, `ChainLink`, `ChainVerification`. |
| `evidence.ts`  | The envelope: `createEvidence`, `verifyEvidence`, and the `EvidenceInput` / `CreateEvidenceOptions` inputs. Integrity is computed internally — there is no standalone integrity function. |
| `chain.ts`     | The tamper-evident timeline: `GENESIS_HASH`, `computeLinkHash`, `nextLink`, `buildChain`, `verifyChain`, `chainHead`, and the `VerifyChainOptions` type. |
| `index.ts`     | The public surface — re-exports the above. |

Everything is pure and side-effect-free. `canonical.ts` is the root of the
dependency graph; `evidence.ts` and `chain.ts` both build on it and nothing else.

---

## 5. How each stack repo relates to Evidence

Evidence is the shared unit; each repo does exactly one job *with* it, and none of
them re-implements the unit. This is the whole ecosystem thesis: one shape, many
jobs.

- **Scout — collects.** Turns external sources into raw material that becomes
  evidence. It is where support originates.
- **Observe — canonicalizes.** Normalizes raw events into canonical observations —
  the canonical-JSON + integrity guarantees Evidence owns are exactly what Observe
  needs, rather than a private copy.
- **Blackboard — timelines.** Orders evidence across agents into a shared,
  tamper-evident timeline — built on the hash chain primitive here.
- **Runtime — approves on.** Gates actions on evidence: an approval *is* a decision
  that cites the evidence supporting it.
- **Replay — reconstructs.** Reproduces an incident byte-for-byte; its transcript
  hashing is the same canonical-hash primitive, and its "golden recording" is
  evidence about what happened.
- **Experience — graphs.** Derives causal/relational structure *over* evidence;
  the derivation lives in Experience, the units it relates live here.
- **Inspect — validates.** Checks evidence and chains for policy/governance
  conformance — it reads the shape and verifies the guarantees, it does not
  redefine them.

The direction of dependency is uniform: **the systems depend on Evidence; Evidence
depends on nothing.** Storing evidence, timelining it, deriving over it, or gating
on it are their jobs — they depend on this shape; this shape depends on nothing.

---

## 6. Deliberate limitations

- **A primitive, not a system.** No storage, query, network, or derivation — by
  design (§1.1). If you need to persist, transport, index, or reason over
  evidence, that is a consuming repo's job.
- **Tamper-evident, not tamper-proof, unless keyed.** Unkeyed hashes and chains
  detect tampering but do not resist a write-capable adversary; supply an HMAC key
  for forgery resistance and manage it accordingly (§2.3, `SECURITY.md`). The
  keyed evidence integrity covers the whole tuple, so attribution and provenance
  are protected too, not just the payload.
- **A bare chain proves a prefix, not completeness.** Tail truncation / rollback
  of the newest links is not self-detectable — a valid prefix of a valid chain is
  itself a valid chain, and an HMAC key does not change this (it prevents forging
  new links, not dropping trailing ones). Middle edits, deletions, insertions, and
  reorders *are* caught. Anchor the head hash and length out of band and pass
  `expectedHead` / `expectedLength` to `verifyChain` (or compare `chainHead`) to
  catch it (§2.3, `SECURITY.md`).
- **JSON-only content.** `content` (and everything hashed) must be canonicalizable
  JSON. Non-finite numbers, `undefined`, functions, and cycles are rejected at the
  encoder, by design (§2.1).
- **Wire contracts are frozen.** The canonical encoding, the `id` / `integrity`
  hashes, and the link hash are cross-repo, on-disk contracts. Any change to what a
  given input hashes to is a breaking change — deliberate, documented in
  `CHANGELOG.md`, and version-gated.
- **Verification needs the original key.** Evidence and chains created with a
  secret must be verified with the *same* secret; the package has no key store and
  no rotation mechanism — that is the operator's responsibility.
