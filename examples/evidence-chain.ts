/**
 * Runnable example: build a tamper-evident timeline of evidence, verify it, then
 * show that any after-the-fact edit is detected.
 *
 *   npm run example
 */
import {
  buildChain,
  createEvidence,
  verifyChain,
  verifyEvidence,
  type Evidence,
} from "../src/index.js";

// A little stream of evidence a governed AI system might produce.
const events: Evidence[] = [
  createEvidence({
    kind: "commit",
    subject: [{ type: "file", id: "src/auth.ts" }],
    actor: { type: "agent", id: "claude-code" },
    content: { sha: "a1b2c3", message: "pad conv weights to 64 bytes" },
    provenance: { source: "git", method: "commit", at: "2026-07-03T09:00:00.000Z" },
  }),
  createEvidence({
    kind: "test",
    subject: [{ type: "file", id: "src/auth.ts" }],
    content: { passed: true, cases: 42 },
    provenance: { source: "ci", method: "test-run", at: "2026-07-03T09:02:00.000Z" },
  }),
  createEvidence({
    kind: "review",
    subject: [{ type: "pull_request", id: "#7" }],
    actor: { type: "actor", id: "ran" },
    content: { decision: "approved", note: "lgtm" },
    provenance: { source: "github", method: "human", at: "2026-07-03T09:10:00.000Z" },
  }),
];

// Each piece is self-verifying; the chain commits their ids into a timeline.
const chain = buildChain(events.map((e) => e.id));

console.log("evidence timeline:");
for (const e of events)
  console.log(
    `  ${e.kind.padEnd(7)} ${e.id.slice(0, 14)}…  (${verifyEvidence(e) ? "intact" : "TAMPERED"})`,
  );
console.log(`\nchain verify: ${JSON.stringify(verifyChain(chain))}`);

// (a) Edit the stored content but keep the id/integrity → integrity fails.
const inPlaceEdit: Evidence = { ...events[2]!, content: { decision: "rejected", note: "lgtm" } };
console.log(`\nafter editing the review's stored content in place:`);
console.log(
  `  verifyEvidence → ${verifyEvidence(inPlaceEdit) ? "intact (!?)" : "✖ tamper detected"}`,
);

// (b) Re-forge it properly via createEvidence → a different id that no longer
// matches the id committed in the recorded timeline.
const reforged = createEvidence({
  kind: "review",
  subject: [{ type: "pull_request", id: "#7" }],
  actor: { type: "actor", id: "ran" },
  content: { decision: "rejected", note: "lgtm" },
  provenance: { source: "github", method: "human", at: "2026-07-03T09:10:00.000Z" },
});
console.log(`  the re-forged evidence gets a NEW id, so it can't slot into the recorded chain:`);
console.log(`    recorded id: ${events[2]!.id.slice(0, 22)}…`);
console.log(`    forged   id: ${reforged.id.slice(0, 22)}…`);
