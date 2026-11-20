import z from "zod";
import type { RandomSource } from "../random.js";

export const exponentialSchema = z.object({
  type: z.literal("exponential"),
  rate: z.number().positive(),
});

export type Exponential = z.infer<typeof exponentialSchema>;

export function quantileExponential(
  input: Exponential,
  uniform: number,
): number {
  return -Math.log1p(-uniform) / input.rate;
}

export function sampleExponential(
  input: Exponential,
  random: RandomSource,
): number {
  return quantileExponential(input, random());
}
