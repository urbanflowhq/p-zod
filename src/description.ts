import * as z from "zod";
import type { ConditionalRV, Reference } from "./database.js";
import type { Categorical } from "./distributions/categorical.js";
import type { NumericDistribution } from "./distributions/index.js";
import type { RandomSource } from "./random.js";

type LiteralDescription<T> = T extends
  | Date
  | RegExp
  | ((...args: never[]) => unknown)
  ? T
  : T extends ReadonlyMap<infer Key, infer Value>
    ? Map<Description<Key>, Description<Value>>
    : T extends ReadonlySet<infer Value>
      ? Set<Description<Value>>
      : T extends readonly unknown[]
        ? { [Index in keyof T]: Description<T[Index]> }
        : T extends object
          ? { [Key in keyof T]: Description<T[Key]> }
          : T;

export type Description<T> =
  | Reference
  | ConditionalRV
  | NumericDistribution
  | Categorical<Description<T>>
  | LiteralDescription<T>;

export interface SamplingContext {
  random: RandomSource;
  values: Map<string, unknown>;
}

export interface SamplingPlan {
  description: unknown;
  draw(context: SamplingContext): unknown;
}

export function literalPlan(description: unknown): SamplingPlan {
  if (description instanceof Date) {
    const timestamp = description.getTime();
    return {
      description: new Date(timestamp),
      draw: () => new Date(timestamp),
    };
  }
  if (description instanceof RegExp) {
    const { source, flags, lastIndex } = description;
    const clone = () => {
      const value = new RegExp(source, flags);
      value.lastIndex = lastIndex;
      return value;
    };
    return { description: clone(), draw: clone };
  }
  return { description, draw: () => description };
}

export function parsedPlan<Value>(
  schema: z.core.$ZodType<Value>,
  build: (value: Value, input: unknown) => SamplingPlan,
): z.ZodType<SamplingPlan> {
  return z.transform((input, ctx) => {
    const result = z.safeParse(schema, input);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ ...issue });
      return z.NEVER;
    }
    return build(result.data, input);
  });
}

export function objectPlan(
  entries: [PropertyKey, SamplingPlan][],
): SamplingPlan {
  return {
    description: Object.fromEntries(
      entries.map(([key, plan]) => [key, plan.description]),
    ),
    draw: (context) =>
      Object.fromEntries(
        entries.map(([key, plan]) => [key, plan.draw(context)]),
      ),
  };
}

export function arrayPlan(values: SamplingPlan[]): SamplingPlan {
  return {
    description: values.map((plan) => plan.description),
    draw: (context) => values.map((plan) => plan.draw(context)),
  };
}
