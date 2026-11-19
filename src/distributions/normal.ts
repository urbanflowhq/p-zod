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
