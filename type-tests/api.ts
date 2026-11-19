import z from "zod";
import * as mini from "zod/mini";
import p, {
  type Bernoulli,
  type Beta,
  type Binomial,
  type Categorical,
  type Description,
  type DiscreteUniform,
  type Distribution,
  type Exponential,
  type Gamma,
  type Geometric,
  type Normal,
  type NumericDistribution,
  type Poisson,
  sampleNormal,
  type Uniform,
} from "../src/index.js";

const uniform: Uniform = p.uniform().parse({ type: "uniform", min: 0, max: 1 });
const normal: Normal = p.normal().parse({ type: "normal", mean: 0, stddev: 1 });
const bernoulli: Bernoulli = p.bernoulli().parse({ type: "bernoulli", p: 0.5 });
const binomial: Binomial = p
  .binomial()
  .parse({ type: "binomial", n: 5, p: 0.5 });
const poisson: Poisson = p.poisson().parse({ type: "poisson", lambda: 2 });
const exponential: Exponential = p
  .exponential()
  .parse({ type: "exponential", rate: 2 });
const gamma: Gamma = p.gamma().parse({ type: "gamma", shape: 2, scale: 3 });
const beta: Beta = p.beta().parse({ type: "beta", alpha: 2, beta: 3 });
const discreteUniform: DiscreteUniform = p
  .discreteUniform()
  .parse({ type: "discrete_uniform", min: 0, max: 3 });
const geometric: Geometric = p.geometric().parse({ type: "geometric", p: 0.5 });
const numeric: NumericDistribution[] = [
  uniform,
  normal,
  bernoulli,
  binomial,
  poisson,
  exponential,
  gamma,
  beta,
  discreteUniform,
  geometric,
];
const categorical: Categorical<Distribution> = p
  .categorical(p.distribution())
  .parse({ type: "categorical", values: numeric });
const distribution: Distribution = categorical;
const strings = p.categorical(z.string());
const typedStrings: Categorical<string> = strings.parse({
  type: "categorical",
  values: ["a"],
});

sampleNormal(normal, Math.random);
// @ts-expect-error Distribution samplers require their own parameter type.
sampleNormal(uniform, Math.random);
// @ts-expect-error Normal parameters must include stddev.
sampleNormal({ type: "normal", mean: 0 }, Math.random);
// @ts-expect-error Custom categorical schemas preserve the value type.
const invalidStrings: z.infer<typeof strings>["values"][number] = 1;

const personSchema = p.probabilistic(
  z.object({ age: z.number().int(), name: z.string() }),
);
const description: Description<{ age: number; name: string }> =
  personSchema.parse({ age: uniform, name: "Ada" });
const person: { age: number; name: string } = personSchema.sample(description);
const drawPerson: () => { age: number; name: string } =
  personSchema.createSampler(description);
const transformed = p.probabilistic(z.number().transform(String));
const text: string = transformed.sample(normal);
const asyncText: Promise<string> = transformed.sampleAsync(2);
const descriptionField = z.object({ value: transformed.descriptionSchema });
const miniNumber: number = p.probabilistic(mini.number()).sample(normal);
// @ts-expect-error Descriptions follow the inferred literal input shape.
const incorrectLiteral: Description<{ age: number }> = { age: "bad" };
// @ts-expect-error Sample results preserve the wrapped schema output type.
const incorrectPerson: { age: string; name: string } =
  personSchema.sample(description);
// @ts-expect-error Transformed sample results are strings, not numbers.
const incorrectNumber: number = transformed.sample(2);

void [
  distribution,
  typedStrings,
  invalidStrings,
  person,
  drawPerson,
  text,
  asyncText,
  descriptionField,
  miniNumber,
  incorrectLiteral,
  incorrectPerson,
  incorrectNumber,
];
