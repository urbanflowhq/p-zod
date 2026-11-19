import z from "zod";
import * as mini from "zod/mini";
import type * as namespaceP from "../src/index.js";
import p, { type infer as Infer, type p as namedP } from "../src/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

const person = p.probabilistic(
  z.object({ age: z.number(), name: z.string().default("Ada") }),
);
const transformed = p.probabilistic(z.number().transform(String));
const normal = p.normal();
const strings = p.categorical(z.string());
const plain = z.number().transform(String);
const miniSchema = mini.object({ enabled: mini.boolean() });
const asynchronous = p.probabilistic(
  z.number().transform(async (value) => String(value)),
);

type Checks = [
  Expect<Equal<p.infer<typeof person>, { age: number; name: string }>>,
  Expect<Equal<p.infer<typeof transformed>, string>>,
  Expect<
    Equal<
      p.infer<typeof normal>,
      {
        type: "normal";
        mean: number;
        stddev: number;
        min?: number | undefined;
        max?: number | undefined;
      }
    >
  >,
  Expect<Equal<p.infer<typeof strings>["values"][number], string>>,
  Expect<Equal<p.infer<typeof plain>, string>>,
  Expect<Equal<p.infer<typeof miniSchema>, { enabled: boolean }>>,
  Expect<Equal<p.infer<typeof asynchronous>, string>>,
  Expect<Equal<namedP.infer<typeof person>, p.infer<typeof person>>>,
  Expect<Equal<namespaceP.infer<typeof person>, p.infer<typeof person>>>,
  Expect<Equal<Infer<typeof person>, p.infer<typeof person>>>,
];

// @ts-expect-error Inference requires a Zod schema or a probabilistic wrapper.
type InvalidSchema = p.infer<string>;
// @ts-expect-error Inference follows transformed output types.
const wrongOutput: p.infer<typeof transformed> = 42;

export type InferenceChecks = [Checks, InvalidSchema];
void wrongOutput;
