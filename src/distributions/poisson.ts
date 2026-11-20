import z from "zod";
import type { RandomSource } from "../random.js";

export const poissonSchema = z.object({
  type: z.literal("poisson"),
  lambda: z.number().nonnegative(),
});

export type Poisson = z.infer<typeof poissonSchema>;

export function samplePoisson(input: Poisson, random: RandomSource): number {
  const { lambda } = input;
  if (lambda === 0) return 0;
  let elapsed = 0;
  let count = 0;
  while (true) {
    elapsed -= Math.log(random());
    if (elapsed > lambda) return count;
    count++;
  }
}

// Sums probabilities upward from zero, so cost grows with lambda like the
// sampler's. Log-space terms avoid underflow of exp(-lambda).
export function quantilePoisson(input: Poisson, uniform: number): number {
  const { lambda } = input;
  if (lambda === 0) return 0;
  const logLambda = Math.log(lambda);
  let logProbability = -lambda;
  let cumulative = 0;
  for (let count = 0; ; count++) {
    if (count > 0) logProbability += logLambda - Math.log(count);
    const probability = Math.exp(logProbability);
    cumulative += probability;
    if (uniform < cumulative) return count;
    // Past the mode, a term this small can no longer change the sum.
    if (count > lambda && probability <= cumulative * 2 ** -53) return count;
  }
}
