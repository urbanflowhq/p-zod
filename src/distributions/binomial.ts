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
