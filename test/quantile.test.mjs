import assert from "node:assert/strict";
import test from "node:test";
import p, * as library from "@urbanflow/p-zod";
import { seededRandom } from "../examples/random.mjs";

const { quantile, UnsupportedQuantileError } = library;
const rv = p.rv;

const grid = [
  0,
  Number.MIN_VALUE,
  1e-300,
  1e-100,
  1e-20,
  1e-10,
  ...Array.from({ length: 1999 }, (_, index) => (index + 1) / 2000),
  1 - 1e-10,
  1 - 2 ** -53,
];

const supported = [
  rv.uniform({ min: -2, max: 5 }),
  rv.uniform({ min: 3, max: 3 }),
  rv.triangular({ min: 1, mode: 2, max: 7 }),
  rv.triangular({ min: 0, mode: 0, max: 8 }),
  rv.triangular({ min: 0, mode: 8, max: 8 }),
  rv.normal({ mean: 3, stddev: 2 }),
  rv.normal({ mean: 3, stddev: 0 }),
  rv.normal({ mean: 0, stddev: 1, min: -0.5, max: 2 }),
  rv.normal({ mean: 0, stddev: 1, min: 30, max: 31 }),
  rv.normal({ mean: 0, stddev: 1, max: -20 }),
  rv.normal({ mean: 10, stddev: 3, min: 12 }),
  rv.bernoulli({ p: 0.3 }),
  rv.bernoulli({ p: 0 }),
  rv.bernoulli({ p: 1 }),
  rv.binomial({ n: 20, p: 0.3 }),
  rv.binomial({ n: 2000, p: 0.9 }),
  rv.poisson({ lambda: 4.5 }),
  rv.poisson({ lambda: 800 }),
  rv.exponential({ rate: 2 }),
  rv.discreteUniform({ min: -3, max: 11 }),
  rv.geometric({ p: 0.2 }),
  rv.geometric({ p: 1 }),
];

// Stratified uniforms give near-exact empirical moments.
function stratified(count) {
  return Array.from({ length: count }, (_, index) => (index + 0.5) / count);
}

function moments(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, variance };
}

function close(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

test("quantile rejects uniforms outside [0, 1)", () => {
  for (const uniform of [NaN, -0.1, 1, 1.5, Infinity, -Infinity]) {
    for (const distribution of [
      rv.uniform({ min: 0, max: 1 }),
      rv.normal({ mean: 0, stddev: 1 }),
      rv.categorical({ values: ["a", "b"] }),
    ]) {
      assert.throws(() => quantile(distribution, uniform), {
        name: "RangeError",
        message: "Uniform must be a number in [0, 1)",
      });
    }
  }
});

test("quantile throws a typed error for gamma and beta", () => {
  for (const distribution of [
    rv.gamma({ shape: 2, scale: 1 }),
    rv.beta({ alpha: 2, beta: 3 }),
  ]) {
    assert.throws(
      () => quantile(distribution, 0.5),
      (error) =>
        error instanceof UnsupportedQuantileError &&
        error.distribution === distribution.type,
    );
  }
});

test("quantile is non-decreasing in u for every supported distribution", () => {
  for (const distribution of supported) {
    let previous = -Infinity;
    for (const uniform of grid) {
      const value = quantile(distribution, uniform);
      assert.ok(
        value >= previous,
        `${JSON.stringify(distribution)} decreases at u=${uniform}`,
      );
      previous = value;
    }
  }
  const categories = rv.categorical({
    values: ["a", "b", "c", "d"],
    weights: [1, 0, 3, 2],
  });
  const order = new Map([
    ["a", 0],
    ["b", 1],
    ["c", 2],
    ["d", 3],
  ]);
  let previous = 0;
  for (const uniform of grid) {
    const index = order.get(quantile(categories, uniform));
    assert.ok(index >= previous, `categorical decreases at u=${uniform}`);
    previous = index;
  }
});

test("quantile matches closed forms", () => {
  assert.equal(quantile(rv.uniform({ min: 2, max: 10 }), 0.25), 4);
  const triangle = rv.triangular({ min: 0, mode: 2, max: 8 });
  close(quantile(triangle, 1 / 16), 1, 1e-15, "triangular lower branch");
  assert.equal(quantile(triangle, 0.25), 2);
  close(quantile(triangle, 0.75), 8 - Math.sqrt(12), 1e-15, "upper branch");
  close(
    quantile(rv.exponential({ rate: 2 }), -Math.expm1(-2)),
    1,
    1e-15,
    "exponential",
  );
  const geometric = rv.geometric({ p: 0.5 });
  assert.deepEqual(
    [0, 0.49, 0.5, 0.74, 0.75].map((u) => quantile(geometric, u)),
    [1, 1, 2, 2, 3],
  );
  const dice = rv.discreteUniform({ min: 1, max: 4 });
  assert.deepEqual(
    [0, 0.24, 0.25, 0.99].map((u) => quantile(dice, u)),
    [1, 1, 2, 4],
  );
  const coin = rv.bernoulli({ p: 0.3 });
  assert.deepEqual(
    [0, 0.69, 0.7, 0.99].map((u) => quantile(coin, u)),
    [0, 0, 1, 1],
  );
  const choice = rv.categorical({
    values: ["a", "b", "c"],
    weights: [1, 0, 3],
  });
  assert.deepEqual(
    [0, 0.24, 0.25, 0.99].map((u) => quantile(choice, u)),
    ["a", "a", "c", "c"],
  );
  assert.equal(quantile(rv.normal({ mean: 3, stddev: 2 }), 0.5), 3);
  assert.equal(quantile(rv.normal({ mean: 3, stddev: 2 }), 0), -Infinity);
  assert.equal(quantile(rv.normal({ mean: 3, stddev: 2, min: 1 }), 0), 1);
});

test("inverting samplers agree with quantile for a constant random source", () => {
  const cases = [
    [library.sampleUniform, rv.uniform({ min: -2, max: 5 })],
    [library.sampleTriangular, rv.triangular({ min: 1, mode: 2, max: 7 })],
    [library.sampleExponential, rv.exponential({ rate: 2 })],
    [library.sampleDiscreteUniform, rv.discreteUniform({ min: -3, max: 11 })],
    [library.sampleGeometric, rv.geometric({ p: 0.2 })],
    [
      library.sampleCategorical,
      rv.categorical({ values: ["a", "b", "c"], weights: [1, 0, 3] }),
    ],
    [library.sampleCategorical, rv.categorical({ values: [1, 2, 3, 4] })],
  ];
  for (const [sample, distribution] of cases) {
    for (const uniform of grid) {
      assert.equal(
        quantile(distribution, uniform),
        sample(distribution, () => uniform),
      );
    }
  }
});

// Reference quantiles solved to 50 digits with Python's decimal module.
const standardNormalReference = [
  [1e-300, -37.0470962993612],
  [1e-200, -30.20559417957964],
  [1e-100, -21.273453560965326],
  [1e-50, -14.933337534788489],
  [1e-20, -9.262340089798407],
  [1.4026823303613662e-11, -6.65644163218544],
  [1.374906442631438e-11, -6.659382045708363],
  [1e-10, -6.361340902404057],
  [1e-5, -4.264890793922825],
  [0.001, -3.0902323061678136],
  [0.0749, -1.4402382675279637],
  [0.0751, -1.43882539275254],
  [0.1, -1.2815515655446004],
  [0.25, -0.6744897501960817],
  [0.4, -0.2533471031357997],
  [0.5, 0],
  [0.6, 0.2533471031357997],
  [0.9, 1.2815515655446006],
  [0.9249, 1.4388253927525403],
  [0.9251, 1.440238267527964],
  [0.99, 2.3263478740408408],
  [0.999999, 4.753424308817087],
  [0.999999999999, 7.0344869100478356],
  [1 - 2 ** -53, 8.209536151601387],
];

test("normal quantile inverts the CDF to 1e-12 relative probability error", () => {
  const normal = rv.normal({ mean: 0, stddev: 1 });
  for (const [uniform, expected] of standardNormalReference) {
    const value = quantile(normal, uniform);
    // First-order |cdf(q(u)) - u|, using the reference quantile's density.
    const density =
      Math.exp(-0.5 * expected * expected) / Math.sqrt(2 * Math.PI);
    const probabilityError = Math.abs(value - expected) * density;
    assert.ok(
      probabilityError <= 1e-12 * Math.min(uniform, 1 - uniform),
      `u=${uniform}: q=${value}, reference ${expected}`,
    );
    assert.ok(
      Math.abs(value - expected) <= 2e-15 * Math.max(1, Math.abs(expected)),
      `u=${uniform}: q=${value}, reference ${expected}`,
    );
  }
  const shifted = rv.normal({ mean: 5, stddev: 2 });
  close(quantile(shifted, 0.975), 5 + 2 * 1.959963984540054, 1e-14, "scaled");
});

// [min, max, u, reference quantile], solved to 50 digits from exact tail masses.
const truncatedNormalReference = [
  [30, 31, 0, 30],
  [30, 31, 1e-12, 30.000000000000032],
  [30, 31, 0.1, 30.003507923244175],
  [30, 31, 0.5, 30.02307046782731],
  [30, 31, 0.9, 30.076570337034926],
  [30, 31, 0.999999999, 30.682267583597188],
  [8, undefined, 0, 8],
  [8, undefined, 1e-12, 8.000000000000123],
  [8, undefined, 0.1, 8.012963049607272],
  [8, undefined, 0.5, 8.084911007391543],
  [8, undefined, 0.9, 8.278803341691198],
  [8, undefined, 0.999999999, 10.245159725452195],
  [undefined, -20, 1e-12, -21.333858409999277],
  [undefined, -20, 0.1, -20.114517324364595],
  [undefined, -20, 0.5, -20.03454167651402],
  [undefined, -20, 0.9, -20.00525426650571],
  [undefined, -20, 0.999999999, -20.000000000049877],
  [-37, -36.5, 0, -37],
  [-37, -36.5, 1e-12, -36.99999738469799],
  [-37, -36.5, 0.1, -36.5629830155908],
  [-37, -36.5, 0.5, -36.51897118823134],
  [-37, -36.5, 0.9, -36.502884313804834],
  [-37, -36.5, 0.999999999, -36.50000000002738],
  [-1, 2, 0, -1],
  [-1, 2, 1e-12, -0.9999999999966169],
  [-1, 2, 0.1, -0.7046478210947452],
  [-1, 2, 0.5, 0.17116391801782477],
  [-1, 2, 0.9, 1.2557153641502152],
  [-1, 2, 0.999999999, 1.9999999848383048],
  [2.5, undefined, 0, 2.5],
  [2.5, undefined, 1e-12, 2.5000000000003544],
  [2.5, undefined, 0.1, 2.537103272481122],
  [2.5, undefined, 0.5, 2.7364996911371438],
  [2.5, undefined, 0.9, 3.22907042670185],
  [2.5, undefined, 0.999999999, 6.775247690931136],
  [-3, 3, 0, -3],
  [-3, 3, 1e-12, -2.99999999977497],
  [-3, 3, 0.1, -1.2754222234675783],
  [-3, 3, 0.5, 0],
  [-3, 3, 0.9, 1.2754222234675783],
  [-3, 3, 0.999999999, 2.999999774969776],
  [1, 1.000000001, 0.1, 1.0000000001],
  [1, 1.000000001, 0.5, 1.0000000005],
  [1, 1.000000001, 0.9, 1.0000000009],
  [-5, -4.999999999999, 0.1, -4.9999999999999],
  [-5, -4.999999999999, 0.5, -4.9999999999995],
  [-5, -4.999999999999, 0.9, -4.9999999999991],
  [35, 35.0000001, 0.1, 35.00000000999999],
  [35, 35.0000001, 0.5, 35.000000049999954],
  [35, 35.0000001, 0.9, 35.000000089999986],
  [-5, -4.99999985, 0.1, -4.999999984999995],
  [-5, -4.99999985, 0.5, -4.999999924999986],
  [-5, -4.99999985, 0.9, -4.999999864999995],
  [-1, -0.999998, 0.5, -0.9999989999995],
  [4, 4.0000002, 0.1, 4.000000019999993],
  [4, 4.0000002, 0.5, 4.00000009999998],
  [4, 4.0000002, 0.9, 4.000000179999993],
];

function truncatedNormal(min, max) {
  return rv.normal({
    mean: 0,
    stddev: 1,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  });
}

test("truncated normal quantile matches tail-exact references", () => {
  for (const [min, max, uniform, expected] of truncatedNormalReference) {
    const value = quantile(truncatedNormal(min, max), uniform);
    assert.ok(
      Math.abs(value - expected) <=
        16 * 2 ** -52 * Math.max(1, Math.abs(expected)),
      `[${min}, ${max}] u=${uniform}: q=${value}, reference ${expected}`,
    );
  }
});

test("truncated normal quantile never leaves its bounds", () => {
  const random = seededRandom(31);
  for (const [min, max] of [
    [-0.5, 2],
    [30, 31],
    [-37, -36.5],
    [36, undefined],
    [undefined, -36],
    [1, 1 + 1e-12],
    [-1e-300, 1e-300],
    [8, 8 + 1e-15],
  ]) {
    const distribution = truncatedNormal(min, max);
    for (const uniform of [...grid, ...Array.from({ length: 2000 }, random)]) {
      const value = quantile(distribution, uniform);
      assert.ok(
        (min === undefined || value >= min) &&
          (max === undefined || value <= max),
        `[${min}, ${max}] u=${uniform}: ${value}`,
      );
    }
  }
  for (const [min, max] of [
    [40, 41],
    [38, undefined],
    [undefined, -38],
  ]) {
    assert.throws(() => quantile(truncatedNormal(min, max), 0.5), {
      name: "RangeError",
      message: "Normal truncation bounds exceed the quantile's tail resolution",
    });
  }
});

test("quantile of uniform draws reproduces each continuous distribution", () => {
  const uniforms = stratified(200000);
  const cases = [
    [rv.uniform({ min: -2, max: 5 }), 1.5, 49 / 12],
    [rv.triangular({ min: 1, mode: 2, max: 7 }), 10 / 3, 31 / 18],
    [rv.normal({ mean: 3, stddev: 2 }), 3, 4],
    [rv.exponential({ rate: 2 }), 0.5, 0.25],
  ];
  for (const [distribution, mean, variance] of cases) {
    const result = moments(uniforms.map((u) => quantile(distribution, u)));
    close(result.mean, mean, 1e-3, `${distribution.type} mean`);
    close(
      result.variance,
      variance,
      2e-3 * variance,
      `${distribution.type} variance`,
    );
  }
});

test("truncated normal quantiles reproduce the rejection sampler's moments", () => {
  const random = seededRandom(17);
  for (const distribution of [
    rv.normal({ mean: 0, stddev: 1, min: -0.5, max: 2 }),
    rv.normal({ mean: 10, stddev: 3, min: 12 }),
    rv.normal({ mean: 0, stddev: 1, min: 4, max: 6 }),
  ]) {
    const inverted = moments(
      stratified(100000).map((u) => quantile(distribution, u)),
    );
    const sampled = moments(
      Array.from({ length: 100000 }, () =>
        library.sampleNormal(distribution, random),
      ),
    );
    const spread = Math.sqrt(sampled.variance);
    close(inverted.mean, sampled.mean, 0.02 * spread, "truncated mean");
    close(
      inverted.variance,
      sampled.variance,
      0.03 * sampled.variance,
      "variance",
    );
  }
});

function frequencies(distribution, count) {
  const counts = new Map();
  for (const uniform of stratified(count)) {
    const value = quantile(distribution, uniform);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function assertFrequencies(distribution, probabilities, count = 100000) {
  const counts = frequencies(distribution, count);
  let total = 0;
  for (const [outcome, probability] of probabilities) {
    total += probability;
    close(
      counts.get(outcome) ?? 0,
      count * probability,
      // Stratified uniforms land within one count of each exact share; the
      // log-space recurrences add a little rounding.
      2,
      `${distribution.type} outcome ${outcome}`,
    );
  }
  assert.ok(
    total > 1 - 1e-9,
    `${distribution.type} probabilities sum to ${total}`,
  );
}

test("discrete quantiles hit each outcome with its probability", () => {
  assertFrequencies(rv.bernoulli({ p: 0.3 }), [
    [0, 0.7],
    [1, 0.3],
  ]);
  assertFrequencies(
    rv.categorical({ values: ["a", "b", "c", "d"], weights: [1, 0, 3, 2] }),
    [
      ["a", 1 / 6],
      ["b", 0],
      ["c", 1 / 2],
      ["d", 1 / 3],
    ],
  );
  assertFrequencies(
    rv.discreteUniform({ min: -3, max: 11 }),
    Array.from({ length: 15 }, (_, index) => [index - 3, 1 / 15]),
  );
  assertFrequencies(
    rv.geometric({ p: 0.2 }),
    Array.from({ length: 120 }, (_, index) => [index + 1, 0.2 * 0.8 ** index]),
  );
  const poisson = [];
  for (let count = 0, probability = Math.exp(-4.5); count < 60; count++) {
    poisson.push([count, probability]);
    probability *= 4.5 / (count + 1);
  }
  assertFrequencies(rv.poisson({ lambda: 4.5 }), poisson);
  const binomial = [];
  for (let k = 0, probability = 0.7 ** 20; k <= 20; k++) {
    binomial.push([k, probability]);
    probability *= ((20 - k) / (k + 1)) * (0.3 / 0.7);
  }
  assertFrequencies(rv.binomial({ n: 20, p: 0.3 }), binomial);
});

test("large discrete parameters keep their mean and variance", () => {
  const uniforms = stratified(5000);
  for (const [distribution, mean, variance] of [
    [rv.poisson({ lambda: 800 }), 800, 800],
    [rv.binomial({ n: 2000, p: 0.9 }), 1800, 180],
  ]) {
    const result = moments(uniforms.map((u) => quantile(distribution, u)));
    close(result.mean, mean, 0.01, `${distribution.type} mean`);
    close(
      result.variance,
      variance,
      0.01 * variance,
      `${distribution.type} variance`,
    );
  }
  assert.equal(quantile(rv.poisson({ lambda: 0 }), 0.9), 0);
  assert.equal(quantile(rv.binomial({ n: 0, p: 0.5 }), 0.9), 0);
  assert.equal(quantile(rv.binomial({ n: 7, p: 0 }), 0.9), 0);
  assert.equal(quantile(rv.binomial({ n: 7, p: 1 }), 0), 7);
  assert.equal(quantile(rv.binomial({ n: 7, p: 0.5 }), 1 - 2 ** -53), 7);
  const top = quantile(rv.poisson({ lambda: 5 }), 1 - 2 ** -53);
  assert.ok(top > 20 && top < 40, `poisson upper tail ${top}`);
});
