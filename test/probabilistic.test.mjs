import assert from "node:assert/strict";
import test from "node:test";
import p, { probabilistic } from "@urbanflow/p-zod";
import z from "zod";
import * as mini from "zod/mini";

test("probabilistic parsing preserves nested descriptions without running outcome transforms", () => {
  let transforms = 0;
  const schema = p.probabilistic(
    z.number().transform((value) => {
      transforms++;
      return String(value);
    }),
  );
  const input = { type: "uniform", min: 0, max: 10 };
  assert.deepEqual(schema.parse(input), input);
  assert.equal(transforms, 0);
  assert.equal(
    schema.sample(input, () => 0.5),
    "5",
  );
  assert.equal(transforms, 1);
});

test("probabilistic schemas sample nested objects, arrays, and categorical choices", () => {
  const schema = p.probabilistic(
    z.object({
      age: z.number().int().min(18),
      labels: z.array(z.string()),
      enabled: z.boolean().default(true),
    }),
  );
  const input = {
    age: { type: "discrete_uniform", min: 18, max: 22 },
    labels: [{ type: "categorical", values: ["a", "b"] }],
  };
  assert.deepEqual(schema.parse(input), input);
  assert.deepEqual(
    schema.sample(input, () => 0.5),
    { age: 20, labels: ["b"], enabled: true },
  );
  assert.deepEqual(input.labels, [{ type: "categorical", values: ["a", "b"] }]);
});

test("literal descriptions are preserved and validated by the outcome schema when sampled", () => {
  const schema = p.probabilistic(z.string().trim().min(2));
  assert.equal(schema.parse(" hello "), " hello ");
  assert.equal(schema.sample(" hello "), "hello");
  assert.throws(() => schema.sample("x"), z.ZodError);
});

test("sample failures preserve outcome error paths and do not retry", () => {
  const schema = p.probabilistic(z.object({ age: z.number().min(18) }));
  let draws = 0;
  const input = { age: { type: "uniform", min: 0, max: 10 } };
  assert.deepEqual(schema.parse(input), input);
  assert.throws(
    () =>
      schema.sample(input, () => {
        draws++;
        return 0.5;
      }),
    (error) => {
      assert.ok(error instanceof z.ZodError);
      assert.deepEqual(error.issues[0].path, ["age"]);
      return true;
    },
  );
  assert.equal(draws, 1);
});

test("description validation checks unselected choices before sampling", () => {
  const schema = p.probabilistic(z.number());
  const input = {
    type: "categorical",
    values: [1, { type: "normal", mean: 0, stddev: -1 }],
    weights: [1, 0],
  };
  assert.equal(schema.safeParse(input).success, false);
  let draws = 0;
  assert.throws(
    () =>
      schema.sample(input, () => {
        draws++;
        return 0;
      }),
    z.ZodError,
  );
  assert.equal(draws, 0);
});

test("prepared probabilistic samplers retain a snapshot and validate each draw", () => {
  const schema = p.probabilistic(
    z.number().transform((value) => `value:${value}`),
  );
  const input = { type: "uniform", min: 2, max: 6 };
  const draw = schema.createSampler(input, () => 0.5);
  input.max = -1;
  assert.equal(draw(), "value:4");
  assert.equal(draw(), "value:4");
});

test("probabilistic supports Zod composition and named exports", () => {
  const field = probabilistic(z.number());
  const schema = z.object({ field: field.descriptionSchema });
  const input = { field: { type: "normal", mean: 5, stddev: 0 } };
  assert.deepEqual(schema.parse(input), input);
  assert.equal(field.sample(input.field), 5);
  assert.equal(Object.hasOwn(z.number(), "sample"), false);
});

test("outcome refinements and preprocessors run on sampled values", () => {
  const schema = p.probabilistic(
    z.preprocess(
      Number,
      z.number().refine((value) => value % 2 === 0),
    ),
  );
  assert.equal(schema.sample({ type: "categorical", values: ["4"] }), 4);
  assert.throws(
    () => schema.sample({ type: "categorical", values: ["3"] }),
    z.ZodError,
  );
});

test("outcome transformations can produce non-JSON values", () => {
  const schema = p.probabilistic(
    z.string().transform((value) => new Date(value)),
  );
  const result = schema.sample({
    type: "categorical",
    values: ["2026-01-01T00:00:00Z"],
  });
  assert.ok(result instanceof Date);
  assert.equal(result.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("sampleAsync supports asynchronous outcome validation", async () => {
  const schema = p.probabilistic(
    z.number().refine(async (value) => value >= 18),
  );
  assert.deepEqual(schema.parse({ type: "uniform", min: 20, max: 30 }), {
    type: "uniform",
    min: 20,
    max: 30,
  });
  assert.equal(
    await schema.sampleAsync({ type: "uniform", min: 20, max: 30 }, () => 0.5),
    25,
  );
  await assert.rejects(schema.sampleAsync(10), z.ZodError);
});

test("probabilistic accepts Zod Mini outcome schemas", () => {
  const schema = p.probabilistic(mini.number());
  assert.equal(
    schema.sample({ type: "uniform", min: 2, max: 4 }, () => 0.5),
    3,
  );
});

test("derived descriptions reject invalid literals and missing required fields", () => {
  const schema = p.probabilistic(
    z.object({ age: z.number().min(18), name: z.string() }),
  );
  assert.equal(schema.safeParse({ age: "old", name: "Ada" }).success, false);
  assert.equal(schema.safeParse({ age: 12, name: "Ada" }).success, false);
  assert.equal(schema.safeParse({ age: 20 }).success, false);
  assert.equal(schema.safeParse({ age: 20, name: "Ada" }).success, true);
});

test("categorical alternatives follow their surrounding outcome schema", () => {
  const schema = p.probabilistic(z.number());
  assert.equal(
    schema.safeParse({
      type: "categorical",
      values: [1, "wrong"],
      weights: [1, 0],
    }).success,
    false,
  );
  const input = {
    type: "categorical",
    values: [
      1,
      { type: "categorical", values: [{ type: "normal", mean: 2, stddev: 0 }] },
    ],
  };
  assert.deepEqual(schema.parse(input), input);
  assert.equal(
    schema.sample(input, () => 0.75),
    2,
  );
});

test("derived parsers follow tuples, records, unions, and recursive schemas", () => {
  const recursive = z.object({
    value: z.number(),
    get children() {
      return z.array(recursive);
    },
  });
  const schema = p.probabilistic(
    z.object({
      tuple: z.tuple([z.string(), z.number()]),
      record: z.record(z.string(), z.number()),
      union: z.union([z.string(), z.number()]),
      tree: recursive,
    }),
  );
  const input = {
    tuple: ["x", { type: "uniform", min: 2, max: 2 }],
    record: { a: { type: "normal", mean: 3, stddev: 0 } },
    union: "hello",
    tree: {
      value: 1,
      children: [{ value: { type: "uniform", min: 4, max: 4 }, children: [] }],
    },
  };
  assert.deepEqual(schema.sample(input), {
    tuple: ["x", 2],
    record: { a: 3 },
    union: "hello",
    tree: { value: 1, children: [{ value: 4, children: [] }] },
  });
  assert.equal(schema.safeParse({ ...input, tuple: [1, "x"] }).success, false);
  assert.equal(
    schema.safeParse({ ...input, record: { a: "bad" } }).success,
    false,
  );
});

test("native values, optional fields, maps, and sets follow the supplied schema", () => {
  const schema = p.probabilistic(
    z.object({
      date: z.date(),
      missing: z.number().optional(),
      nothing: z.null(),
      map: z.map(z.string(), z.number()),
      set: z.set(z.number()),
    }),
  );
  const date = new Date("2026-01-01");
  const input = {
    date,
    nothing: null,
    map: new Map([["a", { type: "uniform", min: 4, max: 4 }]]),
    set: new Set([{ type: "normal", mean: 5, stddev: 0 }]),
  };
  assert.deepEqual(schema.parse(input), input);
  assert.deepEqual(schema.sample(input), {
    date,
    nothing: null,
    map: new Map([["a", 4]]),
    set: new Set([5]),
  });
});

test("standalone JSON APIs are no longer exported", async () => {
  const library = await import("@urbanflow/p-zod");
  for (const name of [
    "json",
    "sample",
    "createSampler",
    "probabilisticJsonSchema",
    "probablisticJsonSchema",
  ]) {
    assert.equal(Object.hasOwn(library, name), false, name);
    assert.equal(Object.hasOwn(p, name), false, name);
  }
});

test("derived parsers retain object key policies and collection lengths", () => {
  const strict = p.probabilistic(z.strictObject({ value: z.number() }));
  assert.equal(
    strict.safeParse({
      value: 1,
      extra: { type: "normal", mean: 0, stddev: 1 },
    }).success,
    false,
  );
  const array = p.probabilistic(z.array(z.number()).min(2));
  assert.equal(array.safeParse([1]).success, false);
  const record = p.probabilistic(z.record(z.enum(["a", "b"]), z.number()));
  assert.equal(record.safeParse({ a: 1 }).success, false);
  const partial = p.probabilistic(
    z.partialRecord(z.enum(["a", "b"]), z.number()),
  );
  assert.deepEqual(partial.parse({ a: 1 }), { a: 1 });
});

test("record key transforms are deferred until sampling", () => {
  let transforms = 0;
  const keys = z.string().transform((key) => {
    transforms++;
    return key.toUpperCase();
  });
  const schema = p.probabilistic(z.record(keys, z.number()));
  assert.deepEqual(schema.parse({ a: 2 }), { a: 2 });
  assert.equal(transforms, 0);
  assert.deepEqual(schema.sample({ a: 2 }), { A: 2 });
  assert.equal(transforms, 1);
});
