import z from "zod";
import p, {
  type Distribution,
  quantile,
  type SamplingOptions,
  type UniformSource,
  UnsupportedQuantileError,
} from "../src/index.js";

const value: number = quantile(p.rv.normal({ mean: 0, stddev: 1 }), 0.5);
const choice: "a" | "b" = quantile(
  p.rv.categorical({ values: ["a", "b"] as ["a", "b"] }),
  0.5,
);
const either: number | string = quantile(
  p.rv.uniform({ min: 0, max: 1 }) as Distribution<string>,
  0.5,
);
const uniform: UniformSource = (id, draw) => (id.length + draw) % 1;
const options: SamplingOptions = { uniform };
const model = p.probabilistic(z.number());
const sampled: number = model.sample(
  p.rv.ref("x"),
  { x: p.rv.uniform({ min: 0, max: 1 }) },
  options,
);
const unsupported: "gamma" | "beta" = new UnsupportedQuantileError("gamma")
  .distribution;

// @ts-expect-error Numeric quantiles return numbers.
const text: string = quantile(p.rv.normal({ mean: 0, stddev: 1 }), 0.5);
// @ts-expect-error Uniform sources receive the RV ID and draw index.
const wrong: UniformSource = (id: number) => id;

void [value, choice, either, sampled, unsupported, text, wrong];
