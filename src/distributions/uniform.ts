import z from "zod";
import type { RandomSource } from "../random.js";

export const uniformSchema = z
  .object({
    type: z.literal("uniform"),
    min: z.number(),
    max: z.number(),
  })
  .refine(({ min, max }) => min <= max, {
    message: "min must be less than or equal to max",
    path: ["max"],
  });

export type Uniform = z.infer<typeof uniformSchema>;

export function quantileUniform(input: Uniform, uniform: number): number {
  const { min, max } = input;
  if (min === max) return min;
  return (1 - uniform) * min + uniform * max;
}

export function sampleUniform(input: Uniform, random: RandomSource): number {
  if (input.min === input.max) return input.min;
  return quantileUniform(input, random());
}
