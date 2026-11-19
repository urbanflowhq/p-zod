import assert from "node:assert/strict";
import test from "node:test";
import p from "@urbanflow/p-zod";
import z from "zod";

const descriptionSchema = p.probabilistic(z.json()).descriptionSchema;

test("categorical choices preserve JSON and nested distributions", () => {
  const value = {
    type: "categorical",
    values: [
      "text",
      42,
      true,
      null,
      [1, { nested: "value" }],
      { type: "uniform", min: 0, max: 1 },
      { type: "normal", mean: 0, stddev: 1 },
      { type: "bernoulli", p: 0.5 },
      { type: "binomial", n: 10, p: 0.5 },
      { type: "poisson", lambda: 2 },
      {
        type: "categorical",
        values: [{ type: "categorical", values: [false, "leaf"] }],
      },
    ],
  };

  assert.deepEqual(descriptionSchema.parse(value), value);
});

test("distributions can appear inside JSON objects and arrays", () => {
  const value = {
    choices: [
      {
        type: "categorical",
        values: [{ child: { type: "normal", mean: 2, stddev: 1 } }],
      },
    ],
  };

  assert.deepEqual(descriptionSchema.parse(value), value);
});

test("categorical choices reject unsupported values at depth", () => {
  for (const unsupported of [undefined, () => 1, 1n]) {
    const value = {
      type: "categorical",
      values: [{ nested: { type: "categorical", values: [unsupported] } }],
    };

    assert.equal(descriptionSchema.safeParse(value).success, false);
  }
});

test("schema parsing preserves weights and the new distributions in nested choices", () => {
  const value = {
    type: "categorical",
    values: [
      { type: "exponential", rate: 2 },
      { type: "gamma", shape: 2, scale: 3 },
      { type: "beta", alpha: 2, beta: 3 },
      { type: "discrete_uniform", min: -2, max: 5 },
      { type: "geometric", p: 0.5 },
      { type: "categorical", values: [null, true], weights: [2, 3] },
    ],
    weights: [1, 2, 3, 4, 5, 6],
  };
  assert.deepEqual(descriptionSchema.parse(value), value);
});
