import z from "zod";
import { bernoulliSchema } from "./bernoulli.js";
import { betaSchema } from "./beta.js";
import { binomialSchema } from "./binomial.js";
import { type Categorical, categoricalSchema } from "./categorical.js";
import { discreteUniformSchema } from "./discrete-uniform.js";
import { exponentialSchema } from "./exponential.js";
import { gammaSchema } from "./gamma.js";
import { geometricSchema } from "./geometric.js";
import { normalSchema } from "./normal.js";
import { poissonSchema } from "./poisson.js";
import { uniformSchema } from "./uniform.js";

export const numericDistributionSchema = z.discriminatedUnion("type", [
  uniformSchema,
  normalSchema,
  bernoulliSchema,
  binomialSchema,
  poissonSchema,
  exponentialSchema,
  gammaSchema,
  betaSchema,
  discreteUniformSchema,
  geometricSchema,
]);

export type NumericDistribution = z.infer<typeof numericDistributionSchema>;
export type Distribution<T = unknown> = NumericDistribution | Categorical<T>;

export function distributionSchema<Value extends z.core.$ZodType>(
  valueSchema: Value,
) {
  return z.discriminatedUnion("type", [
    ...numericDistributionSchema.options,
    categoricalSchema(valueSchema),
  ]);
}

const distributionTypes = new Set<string>([
  ...numericDistributionSchema.options.map((schema) => schema.shape.type.value),
  "categorical",
]);

export function distributionTag(input: unknown): string | undefined {
  if (
    input !== null &&
    typeof input === "object" &&
    "type" in input &&
    typeof input.type === "string" &&
    distributionTypes.has(input.type)
  ) {
    return input.type;
  }
  return undefined;
}
