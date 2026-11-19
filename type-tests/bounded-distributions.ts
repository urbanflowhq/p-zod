import z from "zod";
import p, {
  type Normal,
  sampleNormal,
  sampleTriangular,
  type Triangular,
} from "../src/index.js";

const schema = p.probabilistic(z.number());
const triangle: Triangular = p.rv.triangular({ min: 1, mode: 2, max: 5 });
const triangleInput: p.input<ReturnType<typeof p.triangular>> = triangle;
const triangleOutput: p.infer<ReturnType<typeof p.triangular>> = triangle;
const bounded: Normal = p.rv.normal({ mean: 2, stddev: 1, min: 0, max: 5 });
const oneSided: Normal = p.rv.normal({ mean: 2, stddev: 1, min: 0 });
const original: Normal = p.rv.normal({ mean: 2, stddev: 1 });
const input: p.input<typeof schema> = triangle;
const output: p.infer<typeof schema> = schema.sample(input);
const direct: number = sampleTriangular(triangle, Math.random);
const normal: number = sampleNormal(bounded, Math.random);
const database = p.database({ size: triangle, variation: bounded });

// @ts-expect-error Triangular descriptions require a mode.
p.rv.triangular({ min: 1, max: 5 });
// @ts-expect-error Bounds remain numeric.
p.rv.normal({ mean: 2, stddev: 1, min: "0" });
// @ts-expect-error Low-level samplers require their distribution's parameter type.
sampleTriangular(bounded, Math.random);

void [
  triangleInput,
  triangleOutput,
  oneSided,
  original,
  output,
  direct,
  normal,
  database,
];
