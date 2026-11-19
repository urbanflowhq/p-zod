import assert from "node:assert/strict";
import test from "node:test";
import z from "zod";
import * as library from "../dist/index.js";

const document = library.p.probabilistic(z.json());

const examples = [
  ["uniform", "uniform", { min: 0, max: 1 }, library.uniform],
  ["normal", "normal", { mean: 0, stddev: 1 }, library.normal],
  ["bernoulli", "bernoulli", { p: 0.5 }, library.bernoulli],
  ["binomial", "binomial", { n: 5, p: 0.5 }, library.binomial],
  ["poisson", "poisson", { lambda: 2 }, library.poisson],
  ["exponential", "exponential", { rate: 2 }, library.exponential],
  ["gamma", "gamma", { shape: 2, scale: 3 }, library.gamma],
  ["beta", "beta", { alpha: 2, beta: 3 }, library.beta],
  [
    "discreteUniform",
    "discrete_uniform",
    { min: 0, max: 3 },
    library.discreteUniform,
  ],
  ["geometric", "geometric", { p: 0.5 }, library.geometric],
];

test("distribution schema factories compose with Zod", () => {
  for (const [name, type, parameters, factory] of examples) {
    const input = { type, ...parameters };
    assert.deepEqual(
      z.object({ variable: library.p[name]() }).parse({ variable: input }),
      { variable: input },
    );
    assert.deepEqual(factory().parse(input), input);
  }
});

test("categorical factories support recursive defaults and custom value schemas", () => {
  const input = {
    type: "categorical",
    values: [{ type: "normal", mean: 0, stddev: 1 }],
    weights: [1],
  };
  assert.deepEqual(library.p.categorical().parse(input), input);
  assert.equal(
    library.p.categorical(z.string()).safeParse(input).success,
    false,
  );
  assert.deepEqual(
    library
      .categorical(z.string())
      .parse({ type: "categorical", values: ["hello"] }),
    { type: "categorical", values: ["hello"] },
  );
});

test("reserved distribution tags cannot fall back to ordinary records", () => {
  for (const input of [
    { type: "normal", mean: 0, stddev: -1 },
    { type: "normal", mean: "invalid", stddev: 1 },
    {
      type: "categorical",
      values: [null, { type: "gamma", shape: 0, scale: 1 }],
    },
  ]) {
    assert.equal(document.safeParse({ nested: [input] }).success, false);
  }
});

test("validation completes before the first random draw", () => {
  let calls = 0;
  assert.throws(() =>
    document.sample(
      {
        first: { type: "uniform", min: 0, max: 1 },
        later: { type: "normal", mean: 0, stddev: -1 },
      },
      () => {
        calls++;
        return 0.5;
      },
    ),
  );
  assert.equal(calls, 0);
});

test("prepared samplers validate immediately and retain a parsed snapshot", () => {
  assert.throws(() =>
    document.createSampler({ type: "categorical", values: [] }),
  );
  const input = {
    type: "categorical",
    values: [{ type: "uniform", min: 2, max: 6 }],
  };
  const draw = document.createSampler(input, () => 0.5);
  input.values[0].max = -1;
  assert.equal(draw(), 4);
  assert.equal(draw(), 4);
});

test("distribution factories validate numeric and categorical parameters", () => {
  const schema = library.distribution(z.string());
  assert.equal(
    schema.safeParse({ type: "normal", mean: 0, stddev: 1 }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ type: "categorical", values: ["a"] }).success,
    true,
  );
  assert.equal(
    schema.safeParse({ type: "categorical", values: [1] }).success,
    false,
  );
});

test("the default p API provides schema factories and probabilistic wrappers", () => {
  assert.equal(typeof library.default?.normal, "function");
  assert.equal(library.default, library.p);
  const variable = library.default
    .normal()
    .parse({ type: "normal", mean: 7, stddev: 0 });
  const outcome = library.default.probabilistic(z.number());
  assert.equal(outcome.sample(variable), 7);
  assert.equal(outcome.createSampler(variable)(), 7);
});

test("the package can be imported by its @urbanflow/p-zod name", async () => {
  const { default: p } = await import("@urbanflow/p-zod");
  assert.equal(
    p.uniform().safeParse({ type: "uniform", min: 0, max: 1 }).success,
    true,
  );
});

test("raw distribution schemas are not exported from the package entry point", () => {
  const rawSchemas = Object.keys(library).filter(
    (name) => name.endsWith("Schema") && name !== "ProbabilisticSchema",
  );
  assert.deepEqual(rawSchemas, []);
});
