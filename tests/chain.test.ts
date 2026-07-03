import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChain,
  chainHead,
  GENESIS_HASH,
  nextLink,
  verifyChain,
  type ChainLink,
} from "../src/index.js";

const hashes = ["aa", "bb", "cc", "dd"];

test("buildChain links each content hash to its predecessor", () => {
  const chain = buildChain(hashes);
  assert.equal(chain.length, 4);
  assert.equal(chain[0]!.sequence, 0);
  assert.equal(chain[0]!.previousHash, GENESIS_HASH);
  assert.equal(chain[1]!.previousHash, chain[0]!.hash);
  assert.deepEqual(verifyChain(chain), { ok: true });
});

test("nextLink is pure and matches buildChain incrementally", () => {
  const chain: ChainLink[] = [];
  for (const h of hashes) chain.push(nextLink(chain, h));
  assert.deepEqual(chain, buildChain(hashes));
});

test("editing a link's content breaks verification at that link", () => {
  const chain = buildChain(hashes);
  const tampered = chain.map((l, i) => (i === 2 ? { ...l, contentHash: "ZZ" } : l));
  const v = verifyChain(tampered);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.brokenAt, 2);
});

test("reordering links breaks verification", () => {
  const chain = buildChain(hashes);
  const reordered = [chain[0]!, chain[2]!, chain[1]!, chain[3]!];
  assert.equal(verifyChain(reordered).ok, false);
});

test("deleting a middle link breaks verification (sequence gap)", () => {
  const chain = buildChain(hashes);
  const withHole = [chain[0]!, chain[1]!, chain[3]!];
  const v = verifyChain(withHole);
  assert.equal(v.ok, false);
  assert.equal(v.ok === false && v.brokenAt, 2);
});

test("tail truncation is prefix-consistent alone but caught by a head/length anchor", () => {
  const chain = buildChain(hashes);
  const truncated = chain.slice(0, 2);
  // A prefix of a valid chain is internally consistent — not self-detectable.
  assert.equal(verifyChain(truncated).ok, true);
  // ...but anchoring the expected length or head catches the rollback.
  assert.equal(verifyChain(truncated, { expectedLength: 4 }).ok, false);
  assert.equal(verifyChain(truncated, { expectedHead: chainHead(chain) }).ok, false);
  assert.equal(verifyChain(chain, { expectedLength: 4, expectedHead: chainHead(chain) }).ok, true);
});

test("chainHead returns the latest hash or GENESIS for empty", () => {
  const chain = buildChain(hashes);
  assert.equal(chainHead(chain), chain[3]!.hash);
  assert.equal(chainHead([]), GENESIS_HASH);
});

test("HMAC chain verifies with the right key and fails with the wrong one", () => {
  const chain = buildChain(hashes, "secret-key");
  assert.deepEqual(verifyChain(chain, { secret: "secret-key" }), { ok: true });
  assert.equal(verifyChain(chain, { secret: "wrong-key" }).ok, false);
  assert.equal(verifyChain(chain).ok, false); // unkeyed verify of a keyed chain
});

test("an empty chain verifies", () => {
  assert.deepEqual(verifyChain([]), { ok: true });
});
