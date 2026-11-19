import type { $ZodType, input, output } from "zod/v4/core";
import type { Description } from "./description.js";
import type { ProbabilisticSchema } from "./probabilistic.js";

export type Infer<Schema extends $ZodType | ProbabilisticSchema<$ZodType>> =
  Schema extends ProbabilisticSchema<infer Outcome>
    ? output<Outcome>
    : Schema extends $ZodType
      ? output<Schema>
      : never;

export type Input<Schema extends $ZodType | ProbabilisticSchema<$ZodType>> =
  Schema extends ProbabilisticSchema<infer Outcome>
    ? Description<input<Outcome>>
    : Schema extends $ZodType
      ? input<Schema>
      : never;
