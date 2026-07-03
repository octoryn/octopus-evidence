/**
 * Canonical serialization and hashing — the shared foundation of "verifiable".
 *
 * Evidence is only tamper-evident against a canonical form: object key order,
 * whitespace, and number formatting must not affect a hash. {@link stableStringify}
 * emits deterministic JSON (keys sorted at every depth); {@link canonicalHash}
 * takes its SHA-256. Two values hash equal iff they are semantically identical
 * JSON. This is the exact primitive octopus-observe and octopus-replay each
 * reinvented; it lives here once so every repo agrees on what "equal" means.
 */
import { createHash, createHmac } from "node:crypto";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Deterministic JSON: object keys sorted at every depth so logically-equal
 * values always produce identical text. Rejects values JSON cannot faithfully
 * round-trip (undefined, functions, non-finite numbers, cycles) so a
 * "successful" hash never hides silent data loss.
 */
export function stableStringify(value: JsonValue): string {
  return encode(value, new Set());
}

function encode(value: JsonValue, seen: Set<object>): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value))
      throw new TypeError(`cannot canonicalize non-finite number: ${String(value)}`);
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (t !== "object") throw new TypeError(`cannot canonicalize value of type ${t}`);

  const obj = value as object;
  if (seen.has(obj)) throw new TypeError("cannot canonicalize a circular structure");
  seen.add(obj);
  try {
    if (Array.isArray(value)) {
      // Iterate by index (not .map, which skips holes) and encode a sparse-array
      // hole as `null`, matching JSON.stringify — so the output is always valid
      // JSON and a hole can't corrupt the hash or crash a round-trip.
      let out = "";
      for (let i = 0; i < value.length; i++) {
        if (i > 0) out += ",";
        out += i in value ? encode(value[i]!, seen) : "null";
      }
      return `[${out}]`;
    }
    const record = value as { [key: string]: JsonValue };
    const keys = Object.keys(record).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${encode(record[k]!, seen)}`);
    return `{${parts.join(",")}}`;
  } finally {
    seen.delete(obj);
  }
}

/** SHA-256 (hex) of the canonical encoding of `value`. */
export function canonicalHash(value: JsonValue): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/**
 * Keyed SHA-256 (HMAC) of the canonical encoding — for tamper-*proof* (not just
 * tamper-evident) use, where an adversary with write access must not be able to
 * forge a consistent hash without the secret.
 */
export function canonicalHmac(value: JsonValue, secret: string): string {
  return createHmac("sha256", secret).update(stableStringify(value)).digest("hex");
}

/** Deep structural equality via canonical encoding — the hash's notion of equal. */
export function canonicalEqual(a: JsonValue, b: JsonValue): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** A deep clone that also asserts the value is canonicalizable JSON. */
export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}
