import assert from "node:assert/strict";
import test from "node:test";
import p, * as library from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "../examples/random.mjs";

const number = p.probabilistic(z.number());
const noRandom = () => {
  throw new Error("Unexpected random draw");
};

function moments(draw, count = 20000) {
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < count; i++) {
    const value = draw();
    sum += value;
    squares += value * value;
  }
  const mean = sum / count;
  return { mean, variance: squares / count - mean * mean };
}

test("triangular factory, builder, and numeric dispatch preserve the descriptor", () => {
  const input = { type: "triangular", min: 0, mode: 2, max: 8 };
  assert.deepEqual(p.triangular().parse(input), input);
  assert.deepEqual(p.rv.triangular({ min: 0, mode: 2, max: 8 }), input);
  assert.deepEqual(p.distribution().parse(input), input);
  assert.deepEqual(number.parse(input), input);
  assert.equal(
    library.sampleTriangular(input, () => 0.25),
    2,
  );
  assert.equal(
    number.sample(input, () => 0.25),
    2,
  );
});

test("triangular validates ordered finite bounds and allows endpoint modes and constants", () => {
  for (const parameters of [
    { min: 4, mode: 3, max: 8 },
    { min: 0, mode: 9, max: 8 },
    { min: 8, mode: 8, max: 0 },
    { min: 0, mode: NaN, max: 8 },
    { min: 0, mode: 2, max: Infinity },
  ]) {
    assert.equal(
      p.triangular().safeParse({ type: "triangular", ...parameters }).success,
      false,
    );
    assert.throws(() => p.rv.triangular(parameters), z.ZodError);
  }
  for (const mode of [0, 8]) {
    assert.equal(
      p.triangular().safeParse({ type: "triangular", min: 0, mode, max: 8 })
        .success,
      true,
    );
  }
  assert.equal(
    number.sample({ type: "triangular", min: 3, mode: 3, max: 3 }, noRandom),
    3,
  );
  assert.equal(
    number.sample({ type: "triangular", min: 0, mode: 0, max: 8 }, () => 0.75),
    4,
  );
  assert.equal(
    number.sample({ type: "triangular", min: 0, mode: 8, max: 8 }, () => 0.25),
    4,
  );
  assert.equal(
    number.sample(
      { type: "triangular", min: -1e308, mode: 0, max: 1e308 },
      () => 0.5,
    ),
    0,
  );
});

test("triangular seeded samples follow the asymmetric mean, variance, and support", () => {
  const input = { type: "triangular", min: 1, mode: 2, max: 7 };
  const draw = number.createSampler(input, seededRandom(42));
  const result = moments(() => {
    const value = draw();
    assert.ok(value >= 1 && value <= 7);
    return value;
  });
  assert.ok(Math.abs(result.mean - 10 / 3) < 0.04, JSON.stringify(result));
  assert.ok(Math.abs(result.variance - 31 / 18) < 0.06, JSON.stringify(result));
});

test("normal parsing preserves optional truncation bounds", () => {
  for (const bounds of [{ min: 0 }, { max: 3 }, { min: 0, max: 3 }]) {
    const input = { type: "normal", mean: 1, stddev: 2, ...bounds };
    assert.deepEqual(p.normal().parse(input), input);
    assert.deepEqual(p.rv.normal({ mean: 1, stddev: 2, ...bounds }), input);
    assert.deepEqual(number.parse(input), input);
  }
});

test("normal rejects impossible bounds before consuming randomness", () => {
  for (const parameters of [
    { mean: 0, stddev: 1, min: 2, max: 1 },
    { mean: 0, stddev: 1, min: 2, max: 2 },
    { mean: 0, stddev: 0, min: 1 },
    { mean: 0, stddev: 0, max: -1 },
    { mean: 0, stddev: 1, min: -Infinity },
    { mean: 0, stddev: 1, max: Infinity },
  ]) {
    const input = { type: "normal", ...parameters };
    assert.equal(number.safeParse(input).success, false, JSON.stringify(input));
    assert.throws(() => number.sample(input, noRandom), z.ZodError);
  }
  assert.equal(
    number.sample(
      { type: "normal", mean: 2, stddev: 0, min: 2, max: 2 },
      noRandom,
    ),
    2,
  );
});

test("one-sided normal truncation follows half-normal moments without a clamped mass", () => {
  for (const sign of [1, -1]) {
    const input = {
      type: "normal",
      mean: 10,
      stddev: 2,
      ...(sign === 1 ? { min: 10 } : { max: 10 }),
    };
    const draw = number.createSampler(input, seededRandom(12));
    const result = moments(() => {
      const value = (sign * (draw() - 10)) / 2;
      assert.ok(value > 0);
      return value;
    });
    assert.ok(
      Math.abs(result.mean - Math.sqrt(2 / Math.PI)) < 0.02,
      JSON.stringify(result),
    );
    assert.ok(
      Math.abs(result.variance - (1 - 2 / Math.PI)) < 0.025,
      JSON.stringify(result),
    );
  }
});

test("two-sided truncated normal follows its conditional density", () => {
  const draw = number.createSampler(
    { type: "normal", mean: 0, stddev: 1, min: -1, max: 2 },
    seededRandom(99),
  );
  const result = moments(() => {
    const value = draw();
    assert.ok(value > -1 && value < 2);
    return value;
  });
  assert.ok(
    Math.abs(result.mean - 0.2296371791) < 0.02,
    JSON.stringify(result),
  );
  assert.ok(
    Math.abs(result.variance - 0.5197625392) < 0.025,
    JSON.stringify(result),
  );
});

test("truncated normal handles narrow intervals and distant tails with a bounded random budget", () => {
  for (const bounds of [
    { min: 10 },
    { max: -10 },
    { min: 40, max: 40.01 },
    { min: -40.01, max: -40 },
    { min: -1e-10, max: 1e-10 },
  ]) {
    let calls = 0;
    const random = seededRandom(21);
    const draw = number.createSampler(
      { type: "normal", mean: 0, stddev: 1, ...bounds },
      () => {
        assert.ok(++calls < 10000, "Truncation used too many random draws");
        return random();
      },
    );
    let sum = 0;
    for (let i = 0; i < 100; i++) {
      const value = draw();
      assert.ok(
        value >= (bounds.min ?? -Infinity) && value <= (bounds.max ?? Infinity),
      );
      sum += value;
    }
    if (bounds.min === 10) assert.ok(sum / 100 > 10.05 && sum / 100 < 10.15);
  }
});

test("bounded descriptors survive JSON databases, conditional choices, and shared references", () => {
  const database = p.database(
    JSON.parse(
      JSON.stringify({
        size: { type: "triangular", min: 1, mode: 2, max: 5 },
        choice: p.rv.match(
          "size",
          [[2, { type: "normal", mean: 10, stddev: 1, min: 9, max: 11 }]],
          { type: "normal", mean: 10, stddev: 1, min: 9, max: 11 },
        ),
      }),
    ),
  );
  const model = p.probabilistic(
    z.object({
      first: z.number(),
      second: z.number(),
      bounded: z.number().min(9).max(11),
    }),
  );
  const result = model.sample(
    {
      first: p.rv.ref("size"),
      second: p.rv.ref("size"),
      bounded: p.rv.ref("choice"),
    },
    database,
    { random: seededRandom(7) },
  );
  assert.equal(result.first, result.second);
  assert.ok(result.first >= 1 && result.first <= 5);
  assert.ok(result.bounded >= 9 && result.bounded <= 11);
  assert.throws(() =>
    p.database({ invalid: { type: "triangular", min: 2, mode: 1, max: 3 } }),
  );
});

test("normal truncation handles representable extreme scales and fails on unresolved tails", () => {
  const large = number.sample(
    { type: "normal", mean: -1e308, stddev: 1e308, min: 1e308, max: 1.5e308 },
    () => 0.5,
  );
  assert.ok(Number.isFinite(large) && large >= 1e308 && large <= 1.5e308);
  const tiny = number.sample(
    { type: "normal", mean: 0, stddev: 1e300, min: 1e-300, max: 2e-300 },
    () => 0.5,
  );
  assert.ok(tiny >= 1e-300 && tiny <= 2e-300);
  assert.throws(
    () =>
      number.sample(
        { type: "normal", mean: 0, stddev: Number.MIN_VALUE, min: 1 },
        noRandom,
      ),
    RangeError,
  );
});
