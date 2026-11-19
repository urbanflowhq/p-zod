import assert from "node:assert/strict";
import test from "node:test";
import p from "@urbanflow/p-zod";
import z from "zod";

const ref = (id) => ({ type: "ref", id });

test("RV builders and databases produce plain JSON definitions", () => {
  const database = p.database({
    rain: p.rv.categorical({ values: [true, false], weights: [0.2, 0.8] }),
    wetGrass: p.rv.match("rain", [
      [true, p.rv.categorical({ values: [true, false], weights: [0.9, 0.1] })],
      [
        false,
        p.rv.categorical({ values: [true, false], weights: [0.05, 0.95] }),
      ],
    ]),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(database)), database);
  assert.deepEqual(database.wetGrass, {
    type: "conditional",
    parents: ["rain"],
    cases: [
      {
        when: { rain: true },
        then: {
          type: "categorical",
          values: [true, false],
          weights: [0.9, 0.1],
        },
      },
      {
        when: { rain: false },
        then: {
          type: "categorical",
          values: [true, false],
          weights: [0.05, 0.95],
        },
      },
    ],
  });
  assert.deepEqual(p.rv.ref("rain"), ref("rain"));
});

test("every numeric distribution has a validated RV builder", () => {
  const cases = [
    ["uniform", "uniform", { min: 0, max: 1 }],
    ["normal", "normal", { mean: 0, stddev: 1 }],
    ["bernoulli", "bernoulli", { p: 0.5 }],
    ["binomial", "binomial", { n: 4, p: 0.5 }],
    ["poisson", "poisson", { lambda: 2 }],
    ["exponential", "exponential", { rate: 2 }],
    ["gamma", "gamma", { shape: 2, scale: 3 }],
    ["beta", "beta", { alpha: 2, beta: 3 }],
    ["discreteUniform", "discrete_uniform", { min: 0, max: 3 }],
    ["geometric", "geometric", { p: 0.5 }],
  ];
  for (const [name, type, parameters] of cases) {
    assert.deepEqual(p.rv[name](parameters), { type, ...parameters });
  }
  assert.throws(() => p.rv.normal({ mean: 0, stddev: -1 }), z.ZodError);
});

test("references preserve syntax while repeated IDs share one value per draw", () => {
  const schema = p.probabilistic(
    z.object({ quoted: z.number(), charged: z.number() }),
  );
  const value = { quoted: ref("price"), charged: ref("price") };
  assert.deepEqual(schema.parse(value), value);
  const database = p.database({ price: p.rv.uniform({ min: 0, max: 10 }) });
  const numbers = [0.25, 0.75];
  let calls = 0;
  const draw = schema.createSampler(value, database, {
    random: () => numbers[calls++],
  });
  assert.deepEqual(draw(), { quoted: 2.5, charged: 2.5 });
  assert.deepEqual(draw(), { quoted: 7.5, charged: 7.5 });
  assert.equal(calls, 2);
});

test("conditional tables share their parents with direct references", () => {
  const database = p.database({
    rain: p.rv.categorical({ values: [true, false], weights: [0.2, 0.8] }),
    wet: p.rv.match("rain", [
      [true, p.rv.categorical({ values: [true, false], weights: [0.9, 0.1] })],
      [
        false,
        p.rv.categorical({ values: [true, false], weights: [0.05, 0.95] }),
      ],
    ]),
  });
  const schema = p.probabilistic(
    z.object({ wet: z.boolean(), rain: z.boolean(), sameWet: z.boolean() }),
  );
  let calls = 0;
  const result = schema.sample(
    { wet: ref("wet"), rain: ref("rain"), sameWet: ref("wet") },
    JSON.parse(JSON.stringify(database)),
    {
      random: () => {
        calls++;
        return calls === 1 ? 0.1 : 0.5;
      },
    },
  );
  assert.deepEqual(result, { wet: true, rain: true, sameWet: true });
  assert.equal(calls, 2);
});

test("multiple parent tables and fallback distributions are serializable", () => {
  const database = p.database({
    rain: p.rv.categorical({ values: [true] }),
    sprinkler: p.rv.categorical({ values: [false] }),
    wet: p.rv.conditional({
      parents: ["rain", "sprinkler"],
      cases: [
        {
          when: { rain: true, sprinkler: false },
          then: p.rv.categorical({ values: [true] }),
        },
      ],
      otherwise: p.rv.categorical({ values: [false] }),
    }),
  });
  assert.equal(p.probabilistic(z.boolean()).sample(ref("wet"), database), true);
  assert.equal(
    p.probabilistic(z.boolean()).sample(ref("wet"), {
      ...database,
      rain: p.rv.categorical({ values: [false] }),
    }),
    false,
  );
});

test("missing IDs, malformed references, and cycles fail before any draws", () => {
  const schema = p.probabilistic(
    z.object({ first: z.number(), next: z.number() }),
  );
  assert.equal(
    schema.safeParse({ first: 1, next: { type: "ref", id: "" } }).success,
    false,
  );
  for (const database of [
    {},
    { a: ref("missing") },
    { a: ref("b"), b: ref("a") },
    { a: { type: "categorical", values: [1, ref("a")], weights: [1, 0] } },
    {
      a: {
        type: "conditional",
        parents: ["a"],
        cases: [
          { when: { a: 1 }, then: { type: "normal", mean: 0, stddev: 1 } },
        ],
      },
    },
  ]) {
    let calls = 0;
    assert.throws(
      () =>
        schema.sample(
          { first: { type: "uniform", min: 0, max: 1 }, next: ref("a") },
          database,
          {
            random: () => {
              calls++;
              return 0.5;
            },
          },
        ),
      (error) => {
        assert.equal(error.name, "RVError");
        assert.match(error.message, /a|missing/);
        return true;
      },
    );
    assert.equal(calls, 0);
  }
  assert.throws(
    () => p.database({ a: ref("b"), b: ref("a") }),
    (error) => {
      assert.equal(error.name, "RVError");
      assert.match(error.message, /a.*b.*a/);
      return true;
    },
  );
});

test("conditional tables reject duplicate states, undeclared parents, and callbacks", () => {
  const yes = { type: "categorical", values: [true] };
  for (const node of [
    {
      type: "conditional",
      parents: ["rain"],
      cases: [
        { when: { rain: true }, then: yes },
        { when: { rain: true }, then: yes },
      ],
    },
    {
      type: "conditional",
      parents: ["rain"],
      cases: [{ when: { other: true }, then: yes }],
    },
    {
      type: "conditional",
      parents: ["rain", "rain"],
      cases: [{ when: { rain: true }, then: yes }],
    },
    { type: "conditional", parents: ["rain"], distribution: () => yes },
  ])
    assert.throws(() => p.database({ rain: yes, wet: node }), z.ZodError);
});

test("unmatched conditional states report an error without choosing an arbitrary branch", () => {
  const database = p.database({
    rain: p.rv.categorical({ values: [false] }),
    wet: p.rv.match("rain", [[true, p.rv.categorical({ values: [true] })]]),
  });
  assert.throws(
    () => p.probabilistic(z.boolean()).sample(ref("wet"), database),
    /match|state/,
  );
});

test("references retain a canonical value across different outcome shapes", () => {
  const database = p.database({
    object: p.rv.categorical({
      values: [{ a: { type: "uniform", min: 2, max: 2 }, b: 3 }],
    }),
  });
  const schema = p.probabilistic(
    z.object({
      first: z.object({ a: z.number() }),
      second: z.object({ b: z.number() }),
    }),
  );
  assert.deepEqual(
    schema.sample({ first: ref("object"), second: ref("object") }, database),
    { first: { a: 2 }, second: { b: 3 } },
  );
});

test("resolved categorical alternatives follow the referenced field schema", () => {
  const database = p.database({
    choice: p.rv.categorical({ values: [1, "wrong"], weights: [1, 0] }),
  });
  let calls = 0;
  assert.throws(
    () =>
      p.probabilistic(z.number()).sample(ref("choice"), database, {
        random: () => {
          calls++;
          return 0;
        },
      }),
    z.ZodError,
  );
  assert.equal(calls, 0);
});

test("prepared samplers snapshot definitions and async sampling supports databases", async () => {
  const database = p.database({ price: p.rv.uniform({ min: 2, max: 6 }) });
  const schema = p.probabilistic(z.number().transform(String));
  const draw = schema.createSampler(ref("price"), database, {
    random: () => 0.5,
  });
  database.price.max = -1;
  assert.equal(draw(), "4");
  const asyncSchema = p.probabilistic(
    z.number().transform(async (value) => String(value)),
  );
  assert.equal(
    await asyncSchema.sampleAsync(
      ref("price"),
      { price: p.rv.uniform({ min: 2, max: 6 }) },
      { random: () => 0.5 },
    ),
    "4",
  );
});

test("database validation preserves ID keys and rejects unrecognized definition fields", () => {
  const raw = Object.fromEntries([
    ["__proto__", { type: "uniform", min: 2, max: 2 }],
  ]);
  const database = p.database(raw);
  assert.equal(Object.hasOwn(database, "__proto__"), true);
  assert.equal(
    p.probabilistic(z.number()).sample(ref("__proto__"), database),
    2,
  );
  assert.throws(
    () =>
      p.database({
        price: { type: "normal", mean: 0, stddev: 1, unexpected: true },
      }),
    z.ZodError,
  );
});
