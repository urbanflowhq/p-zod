import type * as z from "zod";
import {
  type ConditionalRV,
  conditionalSchema,
  type Reference,
  type RVDefinition,
  type RVState,
  referenceSchema,
  rvDefinitionSchema,
} from "./database.js";
import { type Bernoulli, bernoulliSchema } from "./distributions/bernoulli.js";
import { type Beta, betaSchema } from "./distributions/beta.js";
import { type Binomial, binomialSchema } from "./distributions/binomial.js";
import {
  type Categorical,
  categoricalSchema,
} from "./distributions/categorical.js";
import {
  type DiscreteUniform,
  discreteUniformSchema,
} from "./distributions/discrete-uniform.js";
import {
  type Exponential,
  exponentialSchema,
} from "./distributions/exponential.js";
import { type Gamma, gammaSchema } from "./distributions/gamma.js";
import { type Geometric, geometricSchema } from "./distributions/geometric.js";
import { type Normal, normalSchema } from "./distributions/normal.js";
import { type Poisson, poissonSchema } from "./distributions/poisson.js";
import {
  type Triangular,
  triangularSchema,
} from "./distributions/triangular.js";
import { type Uniform, uniformSchema } from "./distributions/uniform.js";
import { jsonDataSchema } from "./json.js";

export const uniform = (parameters: Omit<Uniform, "type">): Uniform =>
  uniformSchema.parse({ ...parameters, type: "uniform" });
export const triangular = (parameters: Omit<Triangular, "type">): Triangular =>
  triangularSchema.parse({ ...parameters, type: "triangular" });
export const normal = (parameters: Omit<Normal, "type">): Normal =>
  normalSchema.parse({ ...parameters, type: "normal" });
export const bernoulli = (parameters: Omit<Bernoulli, "type">): Bernoulli =>
  bernoulliSchema.parse({ ...parameters, type: "bernoulli" });
export const binomial = (parameters: Omit<Binomial, "type">): Binomial =>
  binomialSchema.parse({ ...parameters, type: "binomial" });
export const poisson = (parameters: Omit<Poisson, "type">): Poisson =>
  poissonSchema.parse({ ...parameters, type: "poisson" });
export const exponential = (
  parameters: Omit<Exponential, "type">,
): Exponential =>
  exponentialSchema.parse({ ...parameters, type: "exponential" });
export const gamma = (parameters: Omit<Gamma, "type">): Gamma =>
  gammaSchema.parse({ ...parameters, type: "gamma" });
export const beta = (parameters: Omit<Beta, "type">): Beta =>
  betaSchema.parse({ ...parameters, type: "beta" });
export const discreteUniform = (
  parameters: Omit<DiscreteUniform, "type">,
): DiscreteUniform =>
  discreteUniformSchema.parse({ ...parameters, type: "discrete_uniform" });
export const geometric = (parameters: Omit<Geometric, "type">): Geometric =>
  geometricSchema.parse({ ...parameters, type: "geometric" });

export function categorical<Value extends z.JSONType>(
  parameters: Omit<Categorical<Value>, "type">,
): Categorical<Value> {
  const definition: Categorical<Value> = {
    type: "categorical",
    values: parameters.values,
    ...(parameters.weights === undefined
      ? {}
      : { weights: parameters.weights }),
  };
  categoricalSchema(jsonDataSchema).parse(definition);
  return definition;
}

export function ref(id: string): Reference {
  return referenceSchema.parse({ type: "ref", id });
}

export function conditional(
  parameters: Omit<ConditionalRV, "type">,
): ConditionalRV {
  const { otherwise, ...definition } = parameters;
  return conditionalSchema(rvDefinitionSchema).parse({
    ...definition,
    type: "conditional",
    ...(otherwise === undefined ? {} : { otherwise }),
  });
}

export function match(
  parent: string,
  cases: readonly (readonly [RVState, RVDefinition])[],
  otherwise?: RVDefinition,
): ConditionalRV {
  return conditional({
    parents: [parent],
    cases: cases.map(([state, then]) => ({ when: { [parent]: state }, then })),
    ...(otherwise === undefined ? {} : { otherwise }),
  });
}
