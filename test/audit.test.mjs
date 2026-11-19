import assert from "node:assert/strict";
import test from "node:test";
import p from "@urbanflow/p-zod";
import z from "zod";

test("symbol record keys survive description parsing and sampling", () => {
  const key = Symbol("value");
  const schema = p.probabilistic(z.record(z.symbol(), z.number()));
  const input = { [key]: p.rv.uniform({ min: 2, max: 2 }) };
  assert.deepEqual(Reflect.ownKeys(schema.parse(input)), [key]);
  assert.deepEqual(schema.sample(input), { [key]: 2 });
});

test("derived sets and maps enforce literal collection sizes", () => {
  const set = p.probabilistic(z.set(z.number()).min(2));
  const map = p.probabilistic(
    z.map(z.string(), z.number()).check(z.minSize(2)),
  );
  assert.equal(set.safeParse(new Set()).success, false);
  assert.equal(map.safeParse(new Map()).success, false);
  assert.equal(set.safeParse(new Set([1, 2])).success, true);
  assert.equal(
    map.safeParse(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    ).success,
    true,
  );
});

test("exact optional fields accept absence and reject explicit undefined", () => {
  const schema = p.probabilistic(
    z.object({ value: z.number().exactOptional() }),
  );
  assert.deepEqual(schema.parse({}), {});
  assert.equal(schema.safeParse({ value: undefined }).success, false);
  assert.equal(schema.safeParse({ value: "bad" }).success, false);
  assert.deepEqual(schema.sample({ value: p.rv.uniform({ min: 2, max: 2 }) }), {
    value: 2,
  });
  assert.equal(
    p.probabilistic(z.number().exactOptional()).safeParse(undefined).success,
    false,
  );
});

test("loose records preserve values under unmatched keys", () => {
  const schema = p.probabilistic(z.looseRecord(z.enum(["a"]), z.number()));
  const value = { a: 1, b: "text" };
  assert.deepEqual(schema.parse(value), value);
  assert.deepEqual(schema.sample(value), value);
  assert.deepEqual(
    schema.sample({ a: 1, b: p.rv.uniform({ min: 2, max: 2 }) }),
    { a: 1, b: 2 },
  );
});

test("prepared date samples retain a snapshot and are independent objects", () => {
  const date = new Date("2026-01-01T00:00:00Z");
  const draw = p.probabilistic(z.date()).createSampler(date);
  date.setUTCFullYear(2030);
  const first = draw();
  assert.equal(first.getUTCFullYear(), 2026);
  first.setUTCFullYear(2040);
  assert.equal(draw().getUTCFullYear(), 2026);
});

test("database JSON round trips preserve all own property names", () => {
  const payload = JSON.parse(
    '{"__proto__":{"keep":true},"constructor":"data","a":1}',
  );
  const database = p.database({
    value: p.rv.categorical({ values: [payload] }),
  });
  assert.deepEqual(database.value.values[0], payload);
  assert.deepEqual(JSON.parse(JSON.stringify(database)), database);
  assert.deepEqual(
    p.probabilistic(z.unknown()).sample(p.rv.ref("value"), database),
    payload,
  );
});

test("conditional parent IDs can use any valid object property name", () => {
  const database = p.database(
    Object.fromEntries([
      ["__proto__", p.rv.categorical({ values: [true] })],
      [
        "child",
        p.rv.match("__proto__", [[true, p.rv.uniform({ min: 2, max: 2 })]]),
      ],
    ]),
  );
  assert.equal(
    p.probabilistic(z.number()).sample(p.rv.ref("child"), database),
    2,
  );
});

test("database input rejects cycles and hidden non-JSON values with validation errors", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => p.database({ value: { type: "categorical", values: [cyclic] } }),
    z.ZodError,
  );
  const payload = Object.fromEntries([["__proto__", () => true]]);
  assert.throws(
    () => p.database({ value: { type: "categorical", values: [payload] } }),
    z.ZodError,
  );
});

test("symbol object fields follow their declared schemas", () => {
  const key = Symbol("value");
  const schema = p.probabilistic(z.object({ [key]: z.number() }));
  const input = { [key]: p.rv.uniform({ min: 3, max: 3 }) };
  assert.deepEqual(Reflect.ownKeys(schema.parse(input)), [key]);
  assert.deepEqual(schema.sample(input), { [key]: 3 });
  assert.equal(schema.safeParse({ [key]: "bad" }).success, false);
});
