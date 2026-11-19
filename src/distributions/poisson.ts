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
