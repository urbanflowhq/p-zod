import z from "zod";
import type { RandomSource } from "../random.js";
import { sampleLogGamma } from "./gamma.js";

export const betaSchema = z.object({
  type: z.literal("beta"),
  alpha: z.number().positive(),
  beta: z.number().positive(),
});

export type Beta = z.infer<typeof betaSchema>;

export function sampleBeta(input: Beta, random: RandomSource): number {
  const { alpha, beta } = input;
  let difference: number;
  if (alpha < 1 && beta < 1) {
    const coreDifference =
      sampleLogGamma(beta + 1, random) - sampleLogGamma(alpha + 1, random);
    const largestShape = Math.max(alpha, beta);
    // Subtract scaled logarithms before dividing to avoid Infinity - Infinity.
    const scaledDifference =
      Math.log1p(-random()) * (alpha / largestShape) -
      Math.log1p(-random()) * (beta / largestShape);
    difference = coreDifference + scaledDifference / Math.min(alpha, beta);
  } else {
    difference = sampleLogGamma(beta, random) - sampleLogGamma(alpha, random);
  }
  if (difference >= 0) {
    const ratio = Math.exp(-difference);
    return ratio / (1 + ratio);
  }
  return 1 / (1 + Math.exp(difference));
}
