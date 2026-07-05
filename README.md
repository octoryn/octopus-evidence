**English** | [简体中文](README.zh-CN.md)

# Evidence

[![CI](https://github.com/octoryn/octopus-evidence/actions/workflows/ci.yml/badge.svg)](https://github.com/octoryn/octopus-evidence/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/octoryn/octopus-evidence?sort=semver)](https://github.com/octoryn/octopus-evidence/releases/latest)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Zero runtime deps](https://img.shields.io/badge/runtime%20deps-0-success.svg)](package.json)

> The shared **Evidence** primitive for the Octopus stack — a canonical,
> hashable, tamper-evident unit of *support* that flows between repos.

> **Part of [Octopus Core](https://github.com/octoryn) — the open infrastructure stack for governed AI.** This is the root primitive the others share: [Scout](https://github.com/octoryn/octopus-scout) collects evidence · [Observe](https://github.com/octoryn/octopus-observe) canonicalizes it · [Blackboard](https://github.com/octoryn/octopus-blackboard) timelines it · [Workstate](https://github.com/octoryn/octopus-workstate) records work-state on it · [Runtime](https://github.com/octoryn/octopus-runtime) approves on it · [Replay](https://github.com/octoryn/octopus-replay) reconstructs it · [Experience](https://github.com/octoryn/octopus-experience) graphs it · [Inspect](https://github.com/octoryn/octopus-inspect) validates it.

```
Evidence  →  hash  →  chain (timeline)  →  verify
```

## Why

Governance needs evidence. Compliance needs evidence. Audit needs evidence. So
**Evidence is the root** — one level below all of them. An AI system's every
defensible claim ("this was approved", "this test passed", "this decision has a
reason") rests on a unit of evidence that is *canonical* (two equal facts hash
equal), *attributable* (who/what/when), and *tamper-evident* (any later edit is
detectable). This package owns exactly that unit and the cryptography behind it —
and **nothing else**: it derives nothing, orchestrates nothing, executes nothing.

It also removes real duplication: `octopus-observe` and `octopus-replay` each
independently reinvented canonical JSON + SHA-256 + hash chains. Those live here
once, so every repo agrees on what "equal" and "verifiable" mean.

## Install

```bash
npm install octopus-evidence
```

Node ≥ 22. **Zero runtime dependencies** (Node built-ins only). Apache-2.0.

## The Evidence envelope

```ts
import { createEvidence, verifyEvidence } from "octopus-evidence";

const ev = createEvidence({
  kind: "test",
  subject: [{ type: "pull_request", id: "octopus-evidence#1" }],
  actor: { type: "agent", id: "ci" },
  content: { passed: true, cases: 42 },
  provenance: { source: "ci", method: "test-run", at: "2026-07-03T00:00:00.000Z" },
});

ev.id;         // "ev_<sha256…>" — deterministic: identical inputs → identical id
ev.integrity;  // hash over the WHOLE evidence; detects any after-the-fact edit
verifyEvidence(ev); // true — id and integrity both recompute from the fields
```

`createEvidence` is **idempotent** (same inputs always yield the same evidence)
and **content-addressed** (different content, actor, or provenance → different
id). `verifyEvidence` returns `false` if any field was edited — and it never
throws, even on hostile/malformed stored content.

For **tamper-proof** (not just tamper-evident) integrity, key it with an HMAC.
The key covers the **entire** evidence — content, actor, subject, kind, and
provenance — so an attacker without the key cannot forge *who / where / when*
either, not just the payload:

```ts
const sealed = createEvidence(input, { integritySecret: process.env.EVIDENCE_KEY });
verifyEvidence(sealed, process.env.EVIDENCE_KEY); // verify with the same key
```

## The Evidence timeline (tamper-evident chain)

Commit a stream of evidence into an append-only hash chain — the primitive an
audit trail or a Blackboard timeline is built from. Any edit, insertion,
deletion, or reordering of earlier links breaks verification.

```ts
import { buildChain, verifyChain, nextLink, GENESIS_HASH } from "octopus-evidence";

const chain = buildChain(events.map((e) => e.id)); // link each evidence id
verifyChain(chain); // { ok: true }  |  { ok: false, brokenAt, reason }

// Or append incrementally (pure — returns the next link, you store it):
const link = nextLink(chain, nextEvidence.id);
```

Pass a `secret` (via `buildChain`/`nextLink`, and `verifyChain({ secret })`) for
a keyed HMAC chain that can't be forged without the key.

A bare chain proves only that it's a self-consistent **prefix** — so tail
truncation (rollback of the newest entries) isn't self-detectable. Record the
head hash and length out of band and pass them to catch it:

```ts
import { chainHead } from "octopus-evidence";
verifyChain(chain, { expectedHead: chainHead(chain), expectedLength: chain.length });
```

## Canonical hashing (shared foundation)

The same primitive under both:

```ts
import { stableStringify, canonicalHash, canonicalEqual } from "octopus-evidence";

canonicalEqual({ a: 1, b: 2 }, { b: 2, a: 1 }); // true — key order is irrelevant
canonicalHash({ a: 1, b: 2 }) === canonicalHash({ b: 2, a: 1 }); // true
```

`stableStringify` rejects anything JSON can't faithfully round-trip (non-finite
numbers, `undefined`, cycles) so a "successful" hash never hides silent data loss.

## CLI — verify without trusting the store

Ship an auditor a JSON export and this binary, and they can independently
re-verify every id, integrity hash, and chain link — **without writing code and
without trusting whatever store produced it**. Zero runtime dependencies (Node
built-ins only).

```bash
npx octopus-evidence verify export.json
```

The file may contain a single `Evidence`, an array of `Evidence`, a bare array
of `ChainLink`, or an object with an `evidence` and/or `chain` array — the shape
is auto-detected.

```
Evidence: 3/3 verified, 0 failed
Chain: ok (3 links)

Result: VALID
```

If anything was altered, verification recomputes to a mismatch and the tool says
so — a tampered payload, a wrong or missing key, or a broken/reordered chain:

```
Evidence: 2/3 verified, 1 failed
  ✗ [1] ev_9f… — integrity/id mismatch (tampered or wrong secret)
Chain: BROKEN at link 2 — previousHash mismatch at link 2 (chain broken or reordered)

Result: INVALID
```

For HMAC-sealed evidence or chains, pass the same key with `--secret`; for a
machine-readable report (e.g. in CI), pass `--format json`:

```bash
octopus-evidence verify export.json --secret "$EVIDENCE_KEY"
octopus-evidence verify export.json --format json
```

Exit codes: **0** everything valid, **1** any evidence/chain invalid, **2**
usage / IO / parse error. Run `octopus-evidence --help` for the full reference.

## Boundaries

Evidence is a **primitive**, not a system. It has no storage, no query, no
network, no derivation. Storing evidence, timelining it across agents, deriving
causal graphs, or gating actions on it are the jobs of the other repos — they
depend on this shape; this shape depends on nothing.

## License

[Apache-2.0](LICENSE) © Octoryn.
