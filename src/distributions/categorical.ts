import z from "zod";
import type { RandomSource } from "../random.js";

export function categoricalSchema<Value extends z.core.$ZodType>(
  valueSchema: Value,
) {
  return z
    .object({
      type: z.literal("categorical"),
      values: z.tuple([valueSchema], valueSchema),
      weights: z.array(z.number().nonnegative()).optional(),
    })
    .refine(
      ({ values, weights }) =>
        weights === undefined ||
        (weights.length === values.length &&
          weights.some((weight) => weight > 0)),
      {
        message:
          "Weights must match values in length and include a positive weight",
        path: ["weights"],
      },
    );
}

export interface Categorical<T = unknown>
  extends Omit<
    z.infer<ReturnType<typeof categoricalSchema<z.ZodType<unknown>>>>,
    "values"
  > {
  values: [T, ...T[]];
}

function choiceAt<T>(values: [T, ...T[]], index: number): T {
  return values.reduce<T>(
    (choice, value, position) => (position === index ? value : choice),
    values[0],
  );
}

export function sampleCategorical<T>(
  input: Categorical<T>,
  random: RandomSource,
): T {
  const { values, weights } = input;
  if (weights === undefined) {
    return choiceAt(values, Math.floor(random() * values.length));
  }

  const maximum = weights.reduce((max, weight) => Math.max(max, weight), 0);
  const normalized = weights.map((weight) => weight / maximum);
  const total = normalized.reduce((sum, weight) => sum + weight, 0);
  const target = random() * total;
  let cumulative = 0;
  let lastPositiveIndex = 0;
  for (const [index, weight] of normalized.entries()) {
    if (weight === 0) continue;
    lastPositiveIndex = index;
    cumulative += weight;
    if (target < cumulative) return choiceAt(values, index);
  }
  return choiceAt(values, lastPositiveIndex);
}
