import * as z from "zod";
import { compileDescription } from "./compile.js";
import { parseDatabase, type RVDatabase } from "./database.js";
import type { Description, SamplingPlan } from "./description.js";
import { checkedRandom, type RandomSource } from "./random.js";

export interface SamplingOptions {
  random?: RandomSource;
}

export class ProbabilisticSchema<Schema extends z.core.$ZodType> {
  private readonly planSchema: z.ZodType<SamplingPlan>;
  private readonly standalonePlanSchema: z.ZodType<SamplingPlan>;
  readonly descriptionSchema: z.ZodType<Description<z.input<Schema>>>;

  constructor(readonly outcomeSchema: Schema) {
    this.planSchema = compileDescription(outcomeSchema);
    this.standalonePlanSchema = compileDescription(outcomeSchema, new Map());
    this.descriptionSchema = this.planSchema.transform(
      // The generated parser has validated the description against the supplied schema.
      (plan) => plan.description as Description<z.input<Schema>>,
    );
  }

  parse(input: unknown) {
    return this.descriptionSchema.parse(input);
  }
  safeParse(input: unknown) {
    return this.descriptionSchema.safeParse(input);
  }

  private prepare(
    input: unknown,
    databaseOrRandom?: RVDatabase | RandomSource,
    options: SamplingOptions = {},
  ) {
    const parser =
      databaseOrRandom === undefined || typeof databaseOrRandom === "function"
        ? this.standalonePlanSchema
        : compileDescription(
            this.outcomeSchema,
            new Map(Object.entries(parseDatabase(databaseOrRandom))),
          );
    const plan = parser.parse(input);
    const random = checkedRandom(
      typeof databaseOrRandom === "function"
        ? databaseOrRandom
        : (options.random ?? Math.random),
    );
    return () => plan.draw({ random, values: new Map() });
  }

  sample(
    input: unknown,
    databaseOrRandom?: RVDatabase | RandomSource,
    options?: SamplingOptions,
  ): z.output<Schema> {
    return this.createSampler(input, databaseOrRandom, options)();
  }

  async sampleAsync(
    input: unknown,
    databaseOrRandom?: RVDatabase | RandomSource,
    options?: SamplingOptions,
  ): Promise<z.output<Schema>> {
    return await z.parseAsync(
      this.outcomeSchema,
      this.prepare(input, databaseOrRandom, options)(),
    );
  }

  createSampler(
    input: unknown,
    databaseOrRandom?: RVDatabase | RandomSource,
    options?: SamplingOptions,
  ): () => z.output<Schema> {
    const draw = this.prepare(input, databaseOrRandom, options);
    return () => z.parse(this.outcomeSchema, draw());
  }
}

export function probabilistic<Schema extends z.core.$ZodType>(schema: Schema) {
  return new ProbabilisticSchema(schema);
}
