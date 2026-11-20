import z from "zod";
import type { RandomSource } from "../random.js";

export const binomialSchema = z.object({
  type: z.literal("binomial"),
  n: z.int().nonnegative(),
  p: z.number().min(0).max(1),
});

export type Binomial = z.infer<typeof binomialSchema>;

export function sampleBinomial(input: Binomial, random: RandomSource): number {
  const { n, p } = input;
  if (p === 0 || n === 0) return 0;
  if (p === 1) return n;
  let successes = 0;
  for (let trial = 0; trial < n; trial++) {
    if (random() < p) successes++;
  }
  return successes;
}

// Sums probabilities upward from zero, so cost grows with n like the sampler's.
export function quantileBinomial(input: Binomial, uniform: number): number {
  const { n, p } = input;
  if (p === 0 || n === 0) return 0;
  if (p === 1) return n;
  const logOdds = Math.log(p) - Math.log1p(-p);
  let logProbability = n * Math.log1p(-p);
  let cumulative = 0;
  for (let successes = 0; successes < n; successes++) {
    if (successes > 0)
      logProbability += Math.log((n - successes + 1) / successes) + logOdds;
    cumulative += Math.exp(logProbability);
    if (uniform < cumulative) return successes;
  }
  return n;
}
