import z from "zod";
import type { RandomSource } from "../random.js";
import { sampleStandardNormal } from "./normal.js";

export const gammaSchema = z.object({
  type: z.literal("gamma"),
  shape: z.number().positive(),
  scale: z.number().positive(),
});

// Marsaglia and Tsang rejection sampling, with a shape boost below one.
// Logarithms preserve small samples when beta combines two gamma draws.
export function sampleLogGamma(shape: number, random: RandomSource): number {
  if (shape < 1) {
    return sampleLogGamma(shape + 1, random) + Math.log1p(-random()) / shape;
  }
  const adjustedShape = shape - 1 / 3;
  const coefficient = 1 / (3 * Math.sqrt(adjustedShape));
  while (true) {
    const normal = sampleStandardNormal(random);
    const offset = coefficient * normal;
    if (offset <= -1) continue;
    const logVolume = 3 * Math.log1p(offset);
    const draw = random();
    if (
      draw < 1 - 0.0331 * normal ** 4 ||
      Math.log(draw) <
        normal ** 2 / 2 + adjustedShape * (logVolume - Math.expm1(logVolume))
    ) {
      return Math.log(adjustedShape) + logVolume;
    }
  }
}

export type Gamma = z.infer<typeof gammaSchema>;

export function sampleGamma(input: Gamma, random: RandomSource): number {
  const { shape, scale } = input;
  return Math.exp(sampleLogGamma(shape, random) + Math.log(scale));
}
