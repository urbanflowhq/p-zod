import type z from "zod";
import { unknown } from "zod";
import { bernoulliSchema } from "./distributions/bernoulli.js";
import { betaSchema } from "./distributions/beta.js";
import { binomialSchema } from "./distributions/binomial.js";
import { categoricalSchema } from "./distributions/categorical.js";
import { discreteUniformSchema } from "./distributions/discrete-uniform.js";
import { exponentialSchema } from "./distributions/exponential.js";
import { gammaSchema } from "./distributions/gamma.js";
import { geometricSchema } from "./distributions/geometric.js";
import { distributionSchema } from "./distributions/index.js";
import { normalSchema } from "./distributions/normal.js";
import { poissonSchema } from "./distributions/poisson.js";
import { triangularSchema } from "./distributions/triangular.js";
import { uniformSchema } from "./distributions/uniform.js";

export const triangular = () => triangularSchema;
export const uniform = () => uniformSchema;
export const normal = () => normalSchema;
export const bernoulli = () => bernoulliSchema;
export const binomial = () => binomialSchema;
export const poisson = () => poissonSchema;
export const exponential = () => exponentialSchema;
export const gamma = () => gammaSchema;
export const beta = () => betaSchema;
export const discreteUniform = () => discreteUniformSchema;
export const geometric = () => geometricSchema;
export function distribution(valueSchema: z.core.$ZodType = unknown()) {
  return distributionSchema(valueSchema);
}

export function categorical(): ReturnType<
  typeof categoricalSchema<z.ZodUnknown>
>;
export function categorical<Value extends z.core.$ZodType>(
  valueSchema: Value,
): ReturnType<typeof categoricalSchema<Value>>;
export function categorical(valueSchema: z.core.$ZodType = unknown()) {
  return categoricalSchema(valueSchema);
}

export { database } from "./database.js";
export type { Infer as infer, Input as input } from "./infer.js";
export { probabilistic } from "./probabilistic.js";
export * as rv from "./rv.js";
