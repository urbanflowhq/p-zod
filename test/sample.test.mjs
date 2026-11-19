import assert from "node:assert/strict";
import test from "node:test";
import p from "@urbanflow/p-zod";
import z from "zod";

const document = p.probabilistic(z.json());
const sample = (input, random) => document.sample(input, random);

function seededRandom(seed = 123456789) {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test("sample preserves ordinary JSON without mutating it", () => {
  const input = { type: "document", values: [null, true, 3, "text", { a: 1 }] };
  const original = structuredClone(input);
  const output = sample(input);
  assert.deepEqual(output, original);
  assert.deepEqual(input, original);
  assert.notEqual(output, input);
  assert.notEqual(output.values, input.values);
});

test("sample resolves distributions throughout objects, arrays, and categorical choices", () => {
  const input = {
    count: { type: "binomial", n: 4, p: 1 },
    choices: [
      {
        type: "categorical",
        values: [
          "unselected",
          {
            nested: {
              type: "categorical",
              values: [{ type: "uniform", min: 2, max: 6 }],
            },
          },
        ],
      },
    ],
  };
  const original = structuredClone(input);
  assert.deepEqual(
    sample(input, () => 0.75),
    {
      count: 4,
      choices: [{ nested: 5 }],
    },
  );
  assert.deepEqual(input, original);
});

test("categorical validates unselected choices before drawing", () => {
  assert.throws(() =>
    sample(
      {
        type: "categorical",
        values: [null, { type: "categorical", values: [] }],
      },
      () => 0,
    ),
  );
});

test("degenerate distributions return their constant values", () => {
  const distributions = [
    [{ type: "uniform", min: 7, max: 7 }, 7],
    [{ type: "normal", mean: 7, stddev: 0 }, 7],
    [{ type: "bernoulli", p: 0 }, 0],
    [{ type: "bernoulli", p: 1 }, 1],
    [{ type: "binomial", n: 0, p: 0.5 }, 0],
    [{ type: "binomial", n: 4, p: 0 }, 0],
    [{ type: "binomial", n: 4, p: 1 }, 4],
    [{ type: "poisson", lambda: 0 }, 0],
  ];
  for (const [input, expected] of distributions) {
    assert.equal(
      sample(input, () => 0),
      expected,
    );
  }
});

test("continuous samplers remain finite for a random draw of zero", () => {
  assert.ok(
    Number.isFinite(sample({ type: "normal", mean: 0, stddev: 1 }, () => 0)),
  );
  assert.equal(
    sample({ type: "poisson", lambda: 3 }, () => 0),
    0,
  );
});

test("invalid distribution parameters throw, including nested ones", () => {
  for (const input of [
    { type: "uniform", min: 2, max: 1 },
    { type: "normal", mean: 0, stddev: -1 },
    { type: "bernoulli", p: 1.1 },
    { type: "binomial", n: 1.5, p: 0.5 },
    { type: "binomial", n: -1, p: 0.5 },
    { type: "poisson", lambda: -1 },
    { type: "poisson", lambda: Number.POSITIVE_INFINITY },
    { type: "categorical", values: [] },
    { type: "uniform", min: "zero", max: 1 },
  ]) {
    assert.throws(() => sample({ nested: [input] }));
  }
});

test("invalid random draws throw", () => {
  for (const draw of [-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => sample({ type: "bernoulli", p: 0.5 }, () => draw),
      RangeError,
    );
  }
});

test("sampling preserves own __proto__ keys without modifying prototypes", () => {
  const input = JSON.parse('{"__proto__":{"type":"bernoulli","p":1}}');
  const output = p.probabilistic(z.unknown()).sample(input);
  assert.equal(Object.getPrototypeOf(output), Object.prototype);
  assert.equal(Object.hasOwn(output, "__proto__"), true);
  assert.equal(Object.getOwnPropertyDescriptor(output, "__proto__")?.value, 1);
});

test("seeded samples have the expected support, mean, and variance", () => {
  const cases = [
    [{ type: "uniform", min: -2, max: 4 }, 1, 3, (x) => x >= -2 && x <= 4],
    [{ type: "normal", mean: 2, stddev: 3 }, 2, 9, Number.isFinite],
    [{ type: "bernoulli", p: 0.3 }, 0.3, 0.21, (x) => x === 0 || x === 1],
    [
      { type: "binomial", n: 10, p: 0.3 },
      3,
      2.1,
      (x) => Number.isInteger(x) && x >= 0 && x <= 10,
    ],
    [
      { type: "poisson", lambda: 4 },
      4,
      4,
      (x) => Number.isInteger(x) && x >= 0,
    ],
    [
      { type: "poisson", lambda: 1000 },
      1000,
      1000,
      (x) => Number.isInteger(x) && x >= 0,
    ],
    [
      { type: "categorical", values: [0, 1, 2] },
      1,
      2 / 3,
      (x) => [0, 1, 2].includes(x),
    ],
  ];
  const count = 10000;
  for (const [input, expectedMean, expectedVariance, inSupport] of cases) {
    const random = seededRandom();
    const values = Array.from({ length: count }, () => sample(input, random));
    assert.ok(values.every(inSupport), input.type);
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
    assert.ok(
      Math.abs(mean - expectedMean) < 6 * Math.sqrt(expectedVariance / count),
      `${input.type}: mean ${mean}`,
    );
    assert.ok(
      Math.abs(variance - expectedVariance) < expectedVariance * 0.12,
      `${input.type}: variance ${variance}`,
    );
  }
});

test("new distributions sample recursively inside weighted choices", () => {
  const input = {
    type: "categorical",
    values: [
      "unused",
      {
        integers: [{ type: "discrete_uniform", min: 2, max: 4 }],
        trials: { type: "geometric", p: 1 },
        wait: { type: "exponential", rate: 2 },
      },
    ],
    weights: [0, 1],
  };
  const output = sample(input, () => 0);
  assert.deepEqual(output, { integers: [2], trials: 1, wait: 0 });
});

test("weighted categorical selection skips zero weights and uses cumulative boundaries", () => {
  const input = {
    type: "categorical",
    values: ["zero", "a", "zero", "b", "zero"],
    weights: [0, 1, 0, 3, 0],
  };
  for (const [draw, expected] of [
    [0, "a"],
    [0.249999, "a"],
    [0.25, "b"],
    [1 - Number.EPSILON, "b"],
  ]) {
    assert.equal(
      sample(input, () => draw),
      expected,
    );
  }
  assert.equal(
    sample(
      {
        type: "categorical",
        values: ["a", "b"],
        weights: [Number.MAX_VALUE, Number.MAX_VALUE],
      },
      () => 0.75,
    ),
    "b",
  );
});

test("weighted categorical validates zero-weight choices before drawing", () => {
  assert.throws(() =>
    sample(
      {
        type: "categorical",
        values: [{ type: "gamma", shape: -1, scale: 1 }, null],
        weights: [0, 1],
      },
      () => 0,
    ),
  );
});

test("discrete uniform includes both bounds and supports a single value", () => {
  const input = { type: "discrete_uniform", min: -2, max: 2 };
  assert.equal(
    sample(input, () => 0),
    -2,
  );
  assert.equal(
    sample(input, () => 1 - Number.EPSILON),
    2,
  );
  assert.equal(sample({ type: "discrete_uniform", min: 7, max: 7 }), 7);
});

test("new samplers handle a random draw of zero", () => {
  for (const input of [
    { type: "exponential", rate: 2 },
    { type: "gamma", shape: 0.1, scale: 2 },
    { type: "gamma", shape: 1, scale: 2 },
    { type: "gamma", shape: 2, scale: 2 },
    { type: "beta", alpha: 0.001, beta: 0.001 },
    { type: "beta", alpha: 2, beta: 3 },
    { type: "geometric", p: 0.5 },
  ]) {
    assert.ok(Number.isFinite(sample(input, () => 0)), input.type);
  }
});

test("new distribution and weight parameters are validated", () => {
  for (const input of [
    { type: "exponential", rate: 0 },
    { type: "exponential", rate: -1 },
    { type: "gamma", shape: 0, scale: 1 },
    { type: "gamma", shape: 1, scale: 0 },
    { type: "beta", alpha: -1, beta: 1 },
    { type: "beta", alpha: 1, beta: 0 },
    { type: "geometric", p: 0 },
    { type: "geometric", p: 1.1 },
    { type: "discrete_uniform", min: 1.5, max: 3 },
    { type: "discrete_uniform", min: 3, max: 1 },
    {
      type: "discrete_uniform",
      min: -Number.MAX_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    },
    { type: "categorical", values: [1, 2], weights: [1] },
    { type: "categorical", values: [1, 2], weights: [0, 0] },
    { type: "categorical", values: [1, 2], weights: [-1, 2] },
    { type: "categorical", values: [1, 2], weights: [Infinity, 1] },
  ])
    assert.throws(() => sample(input), input.type);
});

for (const [input, expectedMean, expectedVariance, inSupport] of [
  [{ type: "exponential", rate: 2 }, 0.5, 0.25, (x) => x >= 0],
  [{ type: "gamma", shape: 0.2, scale: 2 }, 0.4, 0.8, (x) => x >= 0],
  [{ type: "gamma", shape: 1, scale: 2 }, 2, 4, (x) => x >= 0],
  [{ type: "gamma", shape: 3, scale: 2 }, 6, 12, (x) => x >= 0],
  [{ type: "gamma", shape: 100, scale: 0.5 }, 50, 25, (x) => x >= 0],
  [{ type: "beta", alpha: 2, beta: 3 }, 0.4, 0.04, (x) => x >= 0 && x <= 1],
  [
    { type: "beta", alpha: 0.1, beta: 0.1 },
    0.5,
    1 / 4.8,
    (x) => x >= 0 && x <= 1,
  ],
  [
    { type: "discrete_uniform", min: -2, max: 4 },
    1,
    4,
    (x) => Number.isInteger(x) && x >= -2 && x <= 4,
  ],
  [{ type: "geometric", p: 0.25 }, 4, 12, (x) => Number.isInteger(x) && x >= 1],
  [
    { type: "categorical", values: [0, 1], weights: [1, 3] },
    0.75,
    0.1875,
    (x) => x === 0 || x === 1,
  ],
]) {
  test(`seeded ${JSON.stringify(input)} samples have expected moments`, () => {
    const random = seededRandom();
    const count = 20000;
    const values = Array.from({ length: count }, () => sample(input, random));
    assert.ok(values.every((x) => Number.isFinite(x) && inSupport(x)));
    const mean = values.reduce((sum, x) => sum + x, 0) / count;
    const variance =
      values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / count;
    assert.ok(
      Math.abs(mean - expectedMean) < 6 * Math.sqrt(expectedVariance / count),
      `mean ${mean}`,
    );
    assert.ok(
      Math.abs(variance - expectedVariance) < expectedVariance * 0.15,
      `variance ${variance}`,
    );
  });
}

test("beta retains finite samples when both shapes are extremely small", () => {
  const random = seededRandom();
  for (let index = 0; index < 20; index++) {
    const result = sample(
      { type: "beta", alpha: Number.MIN_VALUE, beta: Number.MIN_VALUE },
      random,
    );
    assert.ok(Number.isFinite(result) && result >= 0 && result <= 1);
  }
});
