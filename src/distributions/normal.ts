import z from "zod";
import type { RandomSource } from "../random.js";

export const normalSchema = z.object({
  type: z.literal("normal"),
  mean: z.number(),
  stddev: z.number().nonnegative(),
});

export function sampleStandardNormal(random: RandomSource): number {
  const radius = Math.sqrt(-2 * Math.log1p(-random()));
  const angle = 2 * Math.PI * random();
  return radius * Math.cos(angle);
}

export type Normal = z.infer<typeof normalSchema>;

export function sampleNormal(input: Normal, random: RandomSource): number {
  const { mean, stddev } = input;
  if (stddev === 0) return mean;
  return mean + stddev * sampleStandardNormal(random);
}
