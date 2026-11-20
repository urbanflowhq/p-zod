import z from "zod";
import type { RandomSource } from "../random.js";

export const geometricSchema = z.object({
  type: z.literal("geometric"),
  p: z.number().positive().max(1),
});

export type Geometric = z.infer<typeof geometricSchema>;

export function quantileGeometric(input: Geometric, uniform: number): number {
  const { p } = input;
  if (p === 1) return 1;
  const trials = Math.floor(Math.log1p(-uniform) / Math.log1p(-p)) + 1;
  if (!Number.isSafeInteger(trials)) {
    throw new RangeError("Geometric sample exceeds the safe integer range");
  }
  return trials;
}

export function sampleGeometric(
  input: Geometric,
  random: RandomSource,
): number {
  if (input.p === 1) return 1;
  return quantileGeometric(input, random());
}
