import { quantileBernoulli } from "./distributions/bernoulli.js";
import { quantileBinomial } from "./distributions/binomial.js";
import {
  type Categorical,
  quantileCategorical,
} from "./distributions/categorical.js";
import { quantileDiscreteUniform } from "./distributions/discrete-uniform.js";
import { quantileExponential } from "./distributions/exponential.js";
import { quantileGeometric } from "./distributions/geometric.js";
import type {
  Distribution,
  NumericDistribution,
} from "./distributions/index.js";
import { quantileNormal } from "./distributions/normal.js";
import { quantilePoisson } from "./distributions/poisson.js";
import { quantileTriangular } from "./distributions/triangular.js";
import { quantileUniform } from "./distributions/uniform.js";
import { checkedUniform } from "./random.js";

export class UnsupportedQuantileError extends Error {
  constructor(readonly distribution: "gamma" | "beta") {
    super(`The ${distribution} distribution has no quantile function`);
    this.name = "UnsupportedQuantileError";
  }
}

export function quantileNumeric(
  value: NumericDistribution,
  uniform: number,
): number {
  switch (value.type) {
    case "uniform":
      return quantileUniform(value, uniform);
    case "triangular":
      return quantileTriangular(value, uniform);
    case "normal":
      return quantileNormal(value, uniform);
    case "bernoulli":
      return quantileBernoulli(value, uniform);
    case "binomial":
      return quantileBinomial(value, uniform);
    case "poisson":
      return quantilePoisson(value, uniform);
    case "exponential":
      return quantileExponential(value, uniform);
    case "discrete_uniform":
      return quantileDiscreteUniform(value, uniform);
    case "geometric":
      return quantileGeometric(value, uniform);
    case "gamma":
    case "beta":
      throw new UnsupportedQuantileError(value.type);
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

export function quantile<T>(distribution: Categorical<T>, uniform: number): T;
export function quantile(
  distribution: NumericDistribution,
  uniform: number,
): number;
export function quantile<T>(
  distribution: Distribution<T>,
  uniform: number,
): number | T;
export function quantile<T>(
  distribution: Distribution<T>,
  uniform: number,
): number | T {
  checkedUniform(uniform);
  return distribution.type === "categorical"
    ? quantileCategorical(distribution, uniform)
    : quantileNumeric(distribution, uniform);
}
