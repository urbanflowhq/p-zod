import z from "zod";
import type { RandomSource } from "../random.js";

export const discreteUniformSchema = z
  .object({
    type: z.literal("discrete_uniform"),
    min: z.int(),
    max: z.int(),
  })
  .refine(({ min, max }) => min <= max && Number.isSafeInteger(max - min + 1), {
    message: "Bounds must define a nonempty range with a safe integer size",
    path: ["max"],
  });

export type DiscreteUniform = z.infer<typeof discreteUniformSchema>;

export function sampleDiscreteUniform(
  input: DiscreteUniform,
  random: RandomSource,
): number {
  const { min, max } = input;
  if (min === max) return min;
  return Math.min(max, min + Math.floor(random() * (max - min + 1)));
}
