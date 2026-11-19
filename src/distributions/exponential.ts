import z from "zod";
import type { RandomSource } from "../random.js";

export const exponentialSchema = z.object({
  type: z.literal("exponential"),
  rate: z.number().positive(),
});

export type Exponential = z.infer<typeof exponentialSchema>;

export function sampleExponential(
  input: Exponential,
  random: RandomSource,
): number {
  const { rate } = input;
  return -Math.log1p(-random()) / rate;
}
