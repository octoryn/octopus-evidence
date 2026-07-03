import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalEqual,
  canonicalHash,
  canonicalHmac,
  cloneJson,
  stableStringify,
  type JsonValue,
} from "../src/index.js";

test("stableStringify sorts keys at every depth", () => {
  assert.equal(stableStringify({ b: 1, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":1}');
});

test("canonicalHash and canonicalEqual ignore key order", () => {
  const a: JsonValue = { x: 1, y: [1, { p: 2, q: 3 }] };
  const b: JsonValue = { y: [1, { q: 3, p: 2 }], x: 1 };
  assert.ok(canonicalEqual(a, b));
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.notEqual(canonicalHash(a), canonicalHash({ x: 2 }));
});

test("canonicalHmac depends on the secret", () => {
  const v: JsonValue = { a: 1 };
  assert.equal(canonicalHmac(v, "k1"), canonicalHmac(v, "k1"));
  assert.notEqual(canonicalHmac(v, "k1"), canonicalHmac(v, "k2"));
  assert.notEqual(canonicalHmac(v, "k1"), canonicalHash(v));
});

test("stableStringify rejects non-finite, undefined, and cycles", () => {
  assert.throws(() => stableStringify(Number.NaN as unknown as JsonValue), TypeError);
  assert.throws(() => stableStringify(undefined as unknown as JsonValue), TypeError);
  const cyclic: Record<string, unknown> = {};
  cyclic["self"] = cyclic;
  assert.throws(() => stableStringify(cyclic as JsonValue), TypeError);
});

test("cloneJson produces an independent deep copy", () => {
  const original: JsonValue = { nested: { list: [1, 2] } };
  const copy = cloneJson(original);
  (copy["nested"] as { list: number[] }).list.push(3);
  assert.deepEqual(original, { nested: { list: [1, 2] } });
});

test("sparse array holes encode as null (valid JSON, no corruption)", () => {
  // eslint-disable-next-line no-sparse-arrays
  const sparse = [1, , 3] as unknown as JsonValue; // hole at index 1
  assert.equal(stableStringify(sparse), "[1,null,3]");
  assert.ok(canonicalEqual(sparse, [1, null, 3]));
  assert.equal(canonicalHash(sparse), canonicalHash([1, null, 3]));
  assert.deepEqual(cloneJson(sparse), [1, null, 3]); // round-trips instead of crashing
});
