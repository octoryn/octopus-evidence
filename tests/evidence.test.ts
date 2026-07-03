import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEvidence,
  verifyEvidence,
  type Evidence,
  type EvidenceInput,
  type JsonValue,
} from "../src/index.js";

const base: EvidenceInput = {
  kind: "test",
  subject: [{ type: "pull_request", id: "octopus-evidence#1" }],
  actor: { type: "actor", id: "ci" },
  content: { passed: true, cases: 42 },
  provenance: { source: "ci", method: "test-run", at: "2026-07-03T00:00:00.000Z" },
};

test("createEvidence is deterministic and idempotent", () => {
  const a = createEvidence(base);
  const b = createEvidence({ ...base, subject: [...base.subject!] });
  assert.equal(a.id, b.id);
  assert.equal(a.integrity, b.integrity);
  assert.match(a.id, /^ev_[0-9a-f]{64}$/);
});

test("different content or provenance yields a different id", () => {
  const a = createEvidence(base);
  assert.notEqual(createEvidence({ ...base, content: { passed: false, cases: 42 } }).id, a.id);
  assert.notEqual(
    createEvidence({ ...base, provenance: { ...base.provenance, at: "2026-07-03T01:00:00.000Z" } })
      .id,
    a.id,
  );
});

test("verifyEvidence passes for an intact evidence and fails on tamper", () => {
  const ev = createEvidence(base);
  assert.ok(verifyEvidence(ev));

  const contentTampered: Evidence = { ...ev, content: { passed: false, cases: 42 } };
  assert.equal(verifyEvidence(contentTampered), false); // integrity no longer matches content

  const idTampered: Evidence = { ...ev, kind: "review" };
  assert.equal(verifyEvidence(idTampered), false); // id no longer matches identity fields
});

test("keyed integrity verifies only with the same secret", () => {
  const ev = createEvidence(base, { integritySecret: "k" });
  assert.ok(verifyEvidence(ev, "k"));
  assert.equal(verifyEvidence(ev, "wrong"), false);
  assert.equal(verifyEvidence(ev), false); // unkeyed verify of a keyed evidence
});

test("keyed integrity blocks identity forgery an unkeyed hash would allow", () => {
  const authentic = createEvidence(base, { integritySecret: "TOP-SECRET" });
  assert.ok(verifyEvidence(authentic, "TOP-SECRET"));
  // An attacker without the secret forges a well-formed evidence with a
  // different actor (rewritten attribution).
  const forged = createEvidence({ ...base, actor: { type: "actor", id: "attacker" } });
  assert.ok(verifyEvidence(forged)); // a valid *unkeyed* evidence (tamper-evident only)
  // But it cannot pass verification under the key — actor/provenance are covered
  // by the keyed integrity, not just the content.
  assert.equal(verifyEvidence(forged, "TOP-SECRET"), false);
});

test("verifyEvidence returns false (never throws) on non-canonicalizable content", () => {
  const ev = createEvidence(base);
  const cyclic: Record<string, unknown> = {};
  cyclic["self"] = cyclic;
  const hostile: Evidence = { ...ev, content: cyclic as unknown as JsonValue };
  assert.equal(verifyEvidence(hostile), false); // does not throw on hostile stored data
});

test("actor is optional and subject defaults to empty", () => {
  const ev = createEvidence({
    kind: "note",
    content: "hi",
    provenance: { source: "human", at: "2026-07-03T00:00:00.000Z" },
  });
  assert.deepEqual(ev.subject, []);
  assert.equal(ev.actor, undefined);
  assert.ok(verifyEvidence(ev));
});
