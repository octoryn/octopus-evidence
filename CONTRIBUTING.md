**English** | [简体中文](CONTRIBUTING.zh-CN.md)

# Contributing to Evidence

Thanks for your interest in contributing. This guide covers the basics.

## Development setup

```bash
npm install
npm test        # node --import tsx --test
```

Requires Node ≥ 22.

## Before opening a PR

Run the full local gate — CI runs the same checks:

```bash
npm run typecheck      # tsc --noEmit under full strict flags, must be clean
npm run format:check   # prettier
npm run lint           # eslint
npm test               # node --test
npm run build          # emits dist/
```

- **Type safety:** the project is `strict` (with `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`). No `any` escapes unless
  unavoidable and commented.
- **Zero runtime dependencies:** the package uses Node built-ins only (hashing is
  `node:crypto`). Do not add a runtime dependency without a very strong reason.
- **Boundaries are the point.** Evidence is a *primitive, not a system*: it must
  never grow storage, query, network, or derivation. Creating, hashing, chaining,
  and verifying the evidence unit is all it does; timelining, storing, deriving,
  or gating on evidence are the jobs of the other repos. A PR that crosses those
  lines will be declined regardless of quality.
- **Wire contracts are frozen.** The canonical encoding, the evidence `id` and
  `integrity` hashes, and the chain link hash are on-disk / cross-repo contracts.
  A change that alters what a given input hashes to is a breaking change — it must
  be deliberate, documented in `CHANGELOG.md`, and version-gated.
- **Tests:** new behavior needs tests, and they must be hermetic (no network, no
  wall-clock time in assertions). Determinism is the whole point — assert exact
  hashes and exact verify results.

## Project layout

See [docs/DESIGN.md](docs/DESIGN.md) for the authoritative architecture, the
guarantees, and the boundaries. Code is written against that spec; update it
first when contracts change.

## Commit / PR

- Keep PRs focused. Describe what changed and why.
- Update `CHANGELOG.md` for user-facing changes.
- Update the relevant docs (`README.md`, `docs/`) when you change the public API.
  Docs are bilingual (English canonical + `*.zh-CN.md` sibling); update both when
  practical.

## Reporting bugs / security issues

File a normal issue for bugs. For security vulnerabilities, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.
