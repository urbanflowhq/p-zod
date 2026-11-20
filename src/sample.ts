import { sampleBernoulli } from "./distributions/bernoulli.js";
import { sampleBeta } from "./distributions/beta.js";
import { sampleBinomial } from "./distributions/binomial.js";
import { sampleDiscreteUniform } from "./distributions/discrete-uniform.js";
import { sampleExponential } from "./distributions/exponential.js";
import { sampleGamma } from "./distributions/gamma.js";
import { sampleGeometric } from "./distributions/geometric.js";
import type { NumericDistribution } from "./distributions/index.js";
import { sampleNormal } from "./distributions/normal.js";
import { samplePoisson } from "./distributions/poisson.js";
import { sampleTriangular } from "./distributions/triangular.js";
import { sampleUniform } from "./distributions/uniform.js";
import type { RandomSource } from "./random.js";

export function finite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Sampled JSON numbers must be finite");
  }
  return value;
}

export function sampleNumeric(
  value: NumericDistribution,
  random: RandomSource,
): number {
  let result: number;
  switch (value.type) {
    case "uniform":
      result = sampleUniform(value, random);
      break;
    case "triangular":
      result = sampleTriangular(value, random);
      break;
    case "normal":
      result = sampleNormal(value, random);
      break;
    case "bernoulli":
      result = sampleBernoulli(value, random);
      break;
    case "binomial":
      result = sampleBinomial(value, random);
      break;
    case "poisson":
      result = samplePoisson(value, random);
      break;
    case "exponential":
      result = sampleExponential(value, random);
      break;
    case "gamma":
      result = sampleGamma(value, random);
      break;
    case "beta":
      result = sampleBeta(value, random);
      break;
    case "discrete_uniform":
      result = sampleDiscreteUniform(value, random);
      break;
    case "geometric":
      result = sampleGeometric(value, random);
      break;
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
  return finite(result);
}
