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

export function sampleTriangular(
  input: Triangular,
  random: RandomSource,
): number {
  const { min, mode, max } = input;
  if (min === max) return min;
  const width = max - min;
  const peak = Number.isFinite(width)
    ? (mode - min) / width
    : (mode / 2 - min / 2) / (max / 2 - min / 2);
  const draw = random();
  if (draw === peak) return mode;
  const fraction =
    draw < peak
      ? Math.sqrt(draw) * Math.sqrt(peak)
      : 1 - Math.sqrt(1 - draw) * Math.sqrt(1 - peak);
  return (1 - fraction) * min + fraction * max;
}
