import z from "zod";
import p, {
  type Categorical,
  type ConditionalRV,
  type Normal,
  type Reference,
  type RVDatabase,
  type SamplingOptions,
} from "../src/index.js";

const normal: Normal = p.rv.normal({ mean: 0, stddev: 1 });
const choice: Categorical<boolean> = p.rv.categorical({
  values: [true, false],
  weights: [0.2, 0.8],
});
const reference: Reference = p.rv.ref("rain");
const conditional: ConditionalRV = p.rv.match("rain", [
  [true, p.rv.categorical({ values: [true] })],
  [false, p.rv.categorical({ values: [false] })],
]);
const database = p.database({
  rain: choice,
  wet: conditional,
  temperature: normal,
});
const compatible: RVDatabase = database;
const knownIds: keyof typeof database = "temperature";
const options: SamplingOptions = { random: () => 0.5 };
const schema = p.probabilistic(
  z.object({ wet: z.boolean(), temperature: z.number() }),
);
const input: p.input<typeof schema> = {
  wet: p.rv.ref("wet"),
  temperature: p.rv.ref("temperature"),
};
const output: { wet: boolean; temperature: number } = schema.sample(
  input,
  database,
  options,
);
const draw: () => { wet: boolean; temperature: number } = schema.createSampler(
  input,
  database,
  options,
);
const asynchronous: Promise<{ wet: boolean; temperature: number }> =
  schema.sampleAsync(input, database, options);

// @ts-expect-error RV definitions require numeric normal parameters.
p.rv.normal({ mean: "zero", stddev: 1 });
// @ts-expect-error Categorical RV choices must be JSON data.
p.rv.categorical({ values: [() => true] });
// @ts-expect-error Conditional matching states must be JSON scalars.
p.rv.match("rain", [[{}, normal]]);
// @ts-expect-error Database keys are preserved for authoring tools.
const unknownId: keyof typeof database = "unknown";

void [
  normal,
  reference,
  compatible,
  knownIds,
  output,
  draw,
  asynchronous,
  unknownId,
];
