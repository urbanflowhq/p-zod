import z from "zod";
import type { RandomSource } from "../random.js";

export const normalSchema = z
  .object({
    type: z.literal("normal"),
    mean: z.number(),
    stddev: z.number().nonnegative(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine(({ mean, stddev, min, max }, ctx) => {
    if (
      min !== undefined &&
      max !== undefined &&
      (min > max || (min === max && stddev > 0))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["max"],
        message: "min must be less than max for a nonconstant normal",
      });
    }
    if (stddev === 0 && min !== undefined && mean < min) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "A constant normal's mean must be within its bounds",
      });
    }
    if (stddev === 0 && max !== undefined && mean > max) {
      ctx.addIssue({
        code: "custom",
        path: ["max"],
        message: "A constant normal's mean must be within its bounds",
      });
    }
  });

export function sampleStandardNormal(random: RandomSource): number {
  const radius = Math.sqrt(-2 * Math.log1p(-random()));
  const angle = 2 * Math.PI * random();
  return radius * Math.cos(angle);
}

export type Normal = z.infer<typeof normalSchema>;

function standardize(value: number, mean: number, stddev: number): number {
  const result = (value - mean) / stddev;
  return Number.isFinite(result) ? result : value / stddev - mean / stddev;
}

// Robert's exponential proposal avoids waiting for extremely unlikely normal tails.
function sampleRightTail(
  min: number,
  max: number,
  random: RandomSource,
): number {
  const rate = min / 2 + Math.hypot(min / 2, 1);
  while (true) {
    const value = min - Math.log1p(-random()) / rate;
    if (value <= max && random() <= Math.exp(-0.5 * (value - rate) ** 2))
      return value;
  }
}

export function sampleNormal(input: Normal, random: RandomSource): number {
  const { mean, stddev, min, max } = input;
  if (stddev === 0) return mean;
  if (min === undefined && max === undefined) {
    return mean + stddev * sampleStandardNormal(random);
  }
  const lower = min === undefined ? -Infinity : standardize(min, mean, stddev);
  const upper = max === undefined ? Infinity : standardize(max, mean, stddev);
  if (
    lower === Infinity ||
    upper === -Infinity ||
    Number.isNaN(lower) ||
    Number.isNaN(upper)
  ) {
    throw new RangeError(
      "Normal truncation bounds exceed floating-point resolution",
    );
  }
  const nearest = Math.max(lower, Math.min(0, upper));
  const width = upper - lower;
  if (
    min !== undefined &&
    max !== undefined &&
    width <= 1 &&
    width * Math.abs(nearest) <= 1
  ) {
    while (true) {
      const draw = random();
      const value = (1 - draw) * min + draw * max;
      const normalized = standardize(value, mean, stddev);
      if (
        random() <=
        Math.exp(0.5 * (nearest - normalized) * (nearest + normalized))
      )
        return value;
    }
  }
  while (true) {
    let value: number;
    if (lower > 0 && min !== undefined) {
      value = min + stddev * (sampleRightTail(lower, upper, random) - lower);
    } else if (upper < 0 && max !== undefined) {
      value = max - stddev * (sampleRightTail(-upper, -lower, random) + upper);
    } else {
      value = mean + stddev * sampleStandardNormal(random);
    }
    if (
      (min === undefined || value >= min) &&
      (max === undefined || value <= max)
    )
      return value;
  }
}

function standardNormalDensity(absolute: number): number {
  // Splitting the square keeps exp's argument exact for distant tails.
  const high = Math.trunc(absolute * 16) / 16;
  return (
    (Math.exp(-0.5 * high * high) *
      Math.exp(-0.5 * (absolute - high) * (absolute + high))) /
    Math.sqrt(2 * Math.PI)
  );
}

// Lower-tail probabilities keep their relative precision, about 1e-14 or
// better down to the smallest normal double.
function standardNormalCdf(value: number): number {
  const absolute = Math.abs(value);
  let tail: number;
  if (absolute > 39) {
    // Below the smallest subnormal double, including infinite bounds.
    tail = 0;
  } else if (absolute < 2) {
    let term = absolute;
    let sum = absolute;
    for (let odd = 3; term > sum * 1e-17; odd += 2) {
      term *= (absolute * absolute) / odd;
      sum += term;
    }
    tail = 0.5 - standardNormalDensity(absolute) * sum;
  } else {
    // Lentz's method for the Mills-ratio continued fraction
    // absolute + 1 / (absolute + 2 / (absolute + 3 / ...)).
    let fraction = absolute;
    let numerator = absolute;
    let denominator = 0;
    for (let index = 1; index <= 1000; index++) {
      denominator = 1 / (absolute + index * denominator);
      numerator = absolute + index / numerator;
      const change = numerator * denominator;
      fraction *= change;
      if (Math.abs(change - 1) <= 2 ** -53) break;
    }
    tail = standardNormalDensity(absolute) / fraction;
  }
  return value > 0 ? 1 - tail : tail;
}

// Coefficients of Wichura's AS241 (PPND16), highest degree first.
const centralNumerator = [
  2509.0809287301227, 33430.57558358813, 67265.7709270087, 45921.95393154987,
  13731.69376550946, 1971.5909503065513, 133.14166789178438, 3.3871328727963665,
];
const centralDenominator = [
  5226.495278852854, 28729.085735721943, 39307.89580009271, 21213.794301586597,
  5394.196021424751, 687.1870074920579, 42.31333070160091, 1,
];
const nearNumerator = [
  0.0007745450142783414, 0.022723844989269184, 0.2417807251774506,
  1.2704582524523684, 3.6478483247632045, 5.769497221460691, 4.630337846156546,
  1.4234371107496835,
];
const nearDenominator = [
  1.0507500716444169e-9, 0.0005475938084995345, 0.015198666563616457,
  0.14810397642748008, 0.6897673349851, 1.6763848301838038, 2.053191626637759,
  1,
];
const farNumerator = [
  2.0103343992922881e-7, 0.000027115555687434876, 0.0012426609473880784,
  0.026532189526576124, 0.29656057182850487, 1.7848265399172913,
  5.463784911164114, 6.657904643501103,
];
const farDenominator = [
  2.0442631033899397e-15, 1.421511758316446e-7, 0.000018463183175100548,
  0.0007868691311456133, 0.014875361290850615, 0.1369298809227358,
  0.599832206555888, 1,
];

function polynomial(coefficients: readonly number[], value: number): number {
  return coefficients.reduce(
    (sum, coefficient) => sum * value + coefficient,
    0,
  );
}

// Wichura's AS241 rational approximation has relative accuracy near 1e-16.
function quantileStandardNormal(probability: number): number {
  const offset = probability - 0.5;
  if (Math.abs(offset) <= 0.425) {
    const r = 0.180625 - offset * offset;
    return (
      (offset * polynomial(centralNumerator, r)) /
      polynomial(centralDenominator, r)
    );
  }
  const tail = offset < 0 ? probability : 1 - probability;
  if (tail === 0) return offset < 0 ? -Infinity : Infinity;
  const r = Math.sqrt(-Math.log(tail));
  const value =
    r <= 5
      ? polynomial(nearNumerator, r - 1.6) /
        polynomial(nearDenominator, r - 1.6)
      : polynomial(farNumerator, r - 5) / polynomial(farDenominator, r - 5);
  return offset < 0 ? -value : value;
}

export function quantileNormal(input: Normal, uniform: number): number {
  const { mean, stddev, min, max } = input;
  if (stddev === 0) return mean;
  if (min === undefined && max === undefined) {
    return mean + stddev * quantileStandardNormal(uniform);
  }
  const lower = min === undefined ? -Infinity : standardize(min, mean, stddev);
  const upper = max === undefined ? Infinity : standardize(max, mean, stddev);
  if (
    lower === Infinity ||
    upper === -Infinity ||
    Number.isNaN(lower) ||
    Number.isNaN(upper)
  ) {
    throw new RangeError(
      "Normal truncation bounds exceed floating-point resolution",
    );
  }
  // Interpolate between tail probabilities on the side where they are small,
  // so distant truncation keeps its relative precision.
  const upperTail = lower > 0;
  const from = standardNormalCdf(upperTail ? -lower : lower);
  const to = standardNormalCdf(upperTail ? -upper : upper);
  if (Math.max(from, to) < 2 ** -1022) {
    // Subnormal tail probabilities have too few significant bits.
    throw new RangeError(
      "Normal truncation bounds exceed the quantile's tail resolution",
    );
  }
  let value: number;
  if (
    min === undefined ||
    max === undefined ||
    Math.abs(to - from) > 2 ** -20 * Math.max(from, to)
  ) {
    const standard = quantileStandardNormal(
      (1 - uniform) * from + uniform * to,
    );
    value = mean + stddev * (upperTail ? -standard : standard);
  } else {
    // The probability difference is too coarse to interpolate. Across such a
    // narrow interval the density is exp(-lower * offset) to within 1e-11.
    const width = upper - lower;
    const tilt = -lower * width;
    const offset =
      tilt === 0
        ? uniform * width
        : (width * Math.log1p(uniform * Math.expm1(tilt))) / tilt;
    value = min + stddev * offset;
  }
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}
