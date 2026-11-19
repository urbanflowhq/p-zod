import z from "zod";
import * as mini from "zod/mini";
import type * as namespaceP from "../src/index.js";
import p, {
  type Description,
  type input as Input,
  type p as namedP,
} from "../src/index.js";

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
const plain = z.number().transform(String);
const defaulted = z.string().default("Ada");
const coerced = z.coerce.number<string>();
const miniSchema = mini.object({ enabled: mini.boolean() });
const miniCoerced = mini.coerce.number();

type Checks = [
  Expect<
    Equal<
      p.input<typeof person>,
      Description<{ age: number; name?: string | undefined }>
    >
  >,
  Expect<Equal<p.input<typeof transformed>, Description<number>>>,
  Expect<
    Equal<
      p.input<typeof normal>,
      {
        type: "normal";
        mean: number;
        stddev: number;
        min?: number | undefined;
        max?: number | undefined;
      }
    >
  >,
  Expect<Equal<p.input<typeof plain>, number>>,
  Expect<Equal<p.input<typeof defaulted>, string | undefined>>,
  Expect<Equal<p.input<typeof coerced>, string>>,
  Expect<Equal<p.input<typeof miniSchema>, { enabled: boolean }>>,
  Expect<Equal<p.input<typeof miniCoerced>, unknown>>,
  Expect<Equal<namedP.input<typeof person>, p.input<typeof person>>>,
  Expect<Equal<namespaceP.input<typeof person>, p.input<typeof person>>>,
  Expect<Equal<Input<typeof person>, p.input<typeof person>>>,
];

const description: p.input<typeof person> = {
  age: { type: "uniform", min: 18, max: 65 },
};
const literal: p.input<typeof transformed> = 42;
// @ts-expect-error Input reflects numeric input, not transformed string output.
const wrongInput: p.input<typeof transformed> = "42";
// @ts-expect-error Input inference requires a Zod schema or probabilistic wrapper.
type InvalidSchema = p.input<string>;

export type InputChecks = [Checks, InvalidSchema];
void [description, literal, wrongInput];
