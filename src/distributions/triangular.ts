import z from "zod";
import type { RandomSource } from "../random.js";

export const triangularSchema = z
  .object({
    type: z.literal("triangular"),
    min: z.number(),
    mode: z.number(),
    max: z.number(),
  })
  .refine(({ min, max }) => min <= max, {
    message: "min must be less than or equal to max",
    path: ["max"],
  })
  .refine(({ min, mode, max }) => min <= mode && mode <= max, {
    message: "mode must lie between min and max",
    path: ["mode"],
  });

export type Triangular = z.infer<typeof triangularSchema>;

export function quantileTriangular(input: Triangular, uniform: number): number {
  const { min, mode, max } = input;
  if (min === max) return min;
  const width = max - min;
  const peak = Number.isFinite(width)
    ? (mode - min) / width
    : (mode / 2 - min / 2) / (max / 2 - min / 2);
  if (uniform === peak) return mode;
  const fraction =
    uniform < peak
      ? Math.sqrt(uniform) * Math.sqrt(peak)
      : 1 - Math.sqrt(1 - uniform) * Math.sqrt(1 - peak);
  return (1 - fraction) * min + fraction * max;
}

export function sampleTriangular(
  input: Triangular,
  random: RandomSource,
): number {
  if (input.min === input.max) return input.min;
  return quantileTriangular(input, random());
}
