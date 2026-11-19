import z from "zod";
import type { RandomSource } from "../random.js";

export const bernoulliSchema = z.object({
  type: z.literal("bernoulli"),
  p: z.number().min(0).max(1),
});

export type Bernoulli = z.infer<typeof bernoulliSchema>;

export function sampleBernoulli(
  input: Bernoulli,
  random: RandomSource,
): number {
  const { p } = input;
  if (p === 0 || p === 1) return p;
  return random() < p ? 1 : 0;
}
