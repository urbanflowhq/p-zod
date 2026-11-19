import * as z from "zod";
import type { RVDefinition } from "./database.js";
import {
  arrayPlan,
  literalPlan,
  objectPlan,
  parsedPlan,
  type SamplingPlan,
} from "./description.js";
import {
  categoricalSchema,
  sampleCategorical,
} from "./distributions/categorical.js";
import {
  distributionTag,
  numericDistributionSchema,
} from "./distributions/index.js";
import { createNetworkCompiler } from "./network.js";
import { sampleNumeric } from "./sample.js";

const unconstrained = z.unknown();

function isSamplingPlan(value: unknown): value is SamplingPlan {
  return (
    value !== null &&
    typeof value === "object" &&
    "description" in value &&
    "draw" in value &&
    typeof value.draw === "function"
  );
}

function descriptionChecks(schema: z.core.$ZodType) {
  const checks = schema._zod.def.checks ?? [];
  if (checks.some((check) => check._zod.def.check === "overwrite")) return [];
  return checks.filter((check) => check._zod.def.check !== "custom");
}

export function compileDescription(
  outcomeSchema: z.core.$ZodType,
  database?: ReadonlyMap<string, RVDefinition>,
): z.ZodType<SamplingPlan> {
  const cache = new WeakMap<z.core.$ZodType, z.ZodType<SamplingPlan>>();
  const numericPlan = parsedPlan(numericDistributionSchema, (value) => ({
    description: value,
    draw: (context) => sampleNumeric(value, context.random),
  }));

  const network = createNetworkCompiler(lift, unconstrained, database);

  function lift(schema: z.core.$ZodType): z.ZodType<SamplingPlan> {
    const cached = cache.get(schema);
    if (cached) return cached;
    const plan: z.ZodType<SamplingPlan> = z.lazy(() => {
      const literal = liftLiteral(schema);
      const categorical = parsedPlan(categoricalSchema(plan), (value) => ({
        description: {
          ...value,
          values: value.values.map((choice) => choice.description),
        },
        draw: (context) =>
          sampleCategorical(value, context.random).draw(context),
      }));
      return z.transform((input, ctx) => {
        const tag = distributionTag(input);
        const special =
          input !== null && typeof input === "object" && "type" in input
            ? input.type
            : undefined;
        const parser =
          special === "ref"
            ? network.reference(schema)
            : special === "conditional"
              ? network.conditional(schema)
              : tag === "categorical"
                ? categorical
                : tag === undefined
                  ? literal
                  : numericPlan;
        const result = parser.safeParse(input);
        if (result.success) return result.data;
        for (const issue of result.error.issues) ctx.addIssue({ ...issue });
        return z.NEVER;
      });
    });
    cache.set(schema, plan);
    return plan;
  }

  function wildcard(): z.ZodType<SamplingPlan> {
    return z.transform((input, ctx) => {
      const children = lift(unconstrained);
      if (Array.isArray(input)) {
        const result = z.array(children).safeParse(input);
        if (result.success) return arrayPlan(result.data);
        for (const issue of result.error.issues) ctx.addIssue({ ...issue });
        return z.NEVER;
      }
      if (
        input !== null &&
        typeof input === "object" &&
        (Object.getPrototypeOf(input) === Object.prototype ||
          Object.getPrototypeOf(input) === null)
      ) {
        return parseRecord(input, children, ctx);
      }
      return literalPlan(input);
    });
  }

  function parseRecord(
    input: object,
    valueSchema:
      | z.ZodType<SamplingPlan>
      | ((key: PropertyKey) => z.ZodType<SamplingPlan>),
    ctx: z.core.$RefinementCtx,
  ): SamplingPlan {
    const entries: [PropertyKey, SamplingPlan][] = [];
    for (const key of Reflect.ownKeys(input)) {
      if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
      const child: unknown = Reflect.get(input, key);
      const parser =
        typeof valueSchema === "function" ? valueSchema(key) : valueSchema;
      const result = parser.safeParse(child);
      if (result.success) entries.push([key, result.data]);
      else
        for (const issue of result.error.issues)
          ctx.addIssue({ ...issue, path: [key, ...issue.path] });
    }
    return objectPlan(entries);
  }

  function liftLiteral(schema: z.core.$ZodType): z.ZodType<SamplingPlan> {
    if (schema instanceof z.core.$ZodObject) {
      const source = schema._zod.def.shape;
      const fields: [PropertyKey, z.ZodType<SamplingPlan>][] = [];
      for (const key of [
        ...Object.keys(source),
        ...Object.getOwnPropertySymbols(source),
      ]) {
        const child: unknown = Reflect.get(source, key);
        if (!(child instanceof z.core.$ZodType))
          throw new TypeError("Invalid Zod object field");
        fields.push([
          key,
          child instanceof z.core.$ZodExactOptional
            ? z.exactOptional(lift(child._zod.def.innerType))
            : lift(child),
        ]);
      }
      const shape = Object.fromEntries(fields);
      const object = z.object(shape);
      const catchall = schema._zod.def.catchall;
      const parser =
        catchall instanceof z.core.$ZodNever
          ? z.strictObject(shape)
          : catchall
            ? object.catchall(lift(catchall))
            : object;
      return parsedPlan(parser, (values, input) => {
        const entries: [PropertyKey, SamplingPlan][] = [];
        for (const key of Reflect.ownKeys(values)) {
          const plan: unknown = Reflect.get(values, key);
          if (!isSamplingPlan(plan))
            throw new TypeError("Invalid compiled object field");
          if (
            plan.description !== undefined ||
            (input !== null &&
              typeof input === "object" &&
              Object.hasOwn(input, key))
          ) {
            entries.push([key, plan]);
          }
        }
        return objectPlan(entries);
      });
    }
    if (schema instanceof z.core.$ZodArray) {
      const array = z.array(lift(schema._zod.def.element));
      return parsedPlan(
        array.clone({ ...array._zod.def, checks: descriptionChecks(schema) }),
        arrayPlan,
      );
    }
    if (schema instanceof z.core.$ZodTuple) {
      const [first, ...restItems] = schema._zod.def.items.map(lift);
      const tuple =
        first === undefined ? z.tuple([]) : z.tuple([first, ...restItems]);
      const rest = schema._zod.def.rest;
      return parsedPlan(rest ? tuple.rest(lift(rest)) : tuple, arrayPlan);
    }
    if (schema instanceof z.core.$ZodRecord) {
      const key = schema._zod.def.keyType;
      const keyPlan = lift(key);
      const keyValidator =
        key instanceof z.core.$ZodPipe
          ? z.transform((input, ctx) => {
              const result = keyPlan.safeParse(input);
              if (!result.success) {
                for (const issue of result.error.issues)
                  ctx.addIssue({ ...issue });
                return z.NEVER;
              }
              const value = result.data.description;
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "symbol"
              )
                return value;
              ctx.addIssue({
                code: "custom",
                message: "Expected a record key",
              });
              return z.NEVER;
            })
          : z.core.clone(key, {
              ...key._zod.def,
              checks: descriptionChecks(key),
            });
      const baseRecord = z.record(keyValidator, z.unknown());
      const record = baseRecord.clone({
        ...baseRecord._zod.def,
        ...(schema._zod.def.partial ? { partial: true } : {}),
        ...(schema._zod.def.mode ? { mode: schema._zod.def.mode } : {}),
      });
      const values = lift(schema._zod.def.valueType);
      return z.transform((input, ctx) => {
        const result = record.safeParse(input);
        if (!result.success) {
          for (const issue of result.error.issues) ctx.addIssue({ ...issue });
          return z.NEVER;
        }
        if (input === null || typeof input !== "object") return z.NEVER;
        if (!schema._zod.def.partial) {
          for (const requiredKey of key._zod.values ?? []) {
            if (
              (typeof requiredKey === "string" ||
                typeof requiredKey === "number" ||
                typeof requiredKey === "symbol") &&
              !Object.hasOwn(input, requiredKey)
            ) {
              const missing = values.safeParse(undefined);
              if (!missing.success) {
                for (const issue of missing.error.issues)
                  ctx.addIssue({
                    ...issue,
                    path: [requiredKey, ...issue.path],
                  });
              }
            }
          }
        }
        return parseRecord(
          input,
          (key) =>
            schema._zod.def.mode === "loose" &&
            !z.safeParse(keyValidator, key).success
              ? lift(unconstrained)
              : values,
          ctx,
        );
      });
    }
    if (schema instanceof z.core.$ZodMap) {
      const map = z.map(
        lift(schema._zod.def.keyType),
        lift(schema._zod.def.valueType),
      );
      return parsedPlan(
        map.clone({ ...map._zod.def, checks: descriptionChecks(schema) }),
        (values) => ({
          description: new Map(
            [...values].map(([key, value]) => [
              key.description,
              value.description,
            ]),
          ),
          draw: (context) =>
            new Map(
              [...values].map(([key, value]) => [
                key.draw(context),
                value.draw(context),
              ]),
            ),
        }),
      );
    }
    if (schema instanceof z.core.$ZodSet) {
      const set = z.set(lift(schema._zod.def.valueType));
      return parsedPlan(
        set.clone({ ...set._zod.def, checks: descriptionChecks(schema) }),
        (values) => ({
          description: new Set([...values].map((value) => value.description)),
          draw: (context) =>
            new Set([...values].map((value) => value.draw(context))),
        }),
      );
    }
    if (schema instanceof z.core.$ZodUnion) {
      return z.union(schema._zod.def.options.map((option) => lift(option)));
    }
    if (schema instanceof z.core.$ZodIntersection) {
      const left = lift(schema._zod.def.left).transform(
        (plan) => plan.description,
      );
      const right = lift(schema._zod.def.right).transform(
        (plan) => plan.description,
      );
      return z.intersection(left, right).pipe(lift(unconstrained));
    }
    if (schema instanceof z.core.$ZodLazy)
      return z.lazy(() => lift(schema._zod.def.getter()));
    if (schema instanceof z.core.$ZodExactOptional)
      return lift(schema._zod.def.innerType);
    if (schema instanceof z.core.$ZodOptional) {
      return z
        .optional(lift(schema._zod.def.innerType))
        .transform((plan) => plan ?? literalPlan(undefined));
    }
    if (schema instanceof z.core.$ZodNullable) {
      return z
        .nullable(lift(schema._zod.def.innerType))
        .transform((plan) => plan ?? literalPlan(null));
    }
    if (
      schema instanceof z.core.$ZodDefault ||
      schema instanceof z.core.$ZodPrefault
    ) {
      return z
        .optional(lift(schema._zod.def.innerType))
        .transform((plan) => plan ?? literalPlan(undefined));
    }
    if (schema instanceof z.core.$ZodReadonly)
      return lift(schema._zod.def.innerType);
    if (schema instanceof z.core.$ZodNonOptional) {
      return lift(schema._zod.def.innerType).refine(
        (plan) => plan.description !== undefined,
        "Required value",
      );
    }
    if (schema instanceof z.core.$ZodPreprocess) return wildcard();
    if (schema instanceof z.core.$ZodPipe) return lift(schema._zod.def.in);
    if (
      schema instanceof z.core.$ZodAny ||
      schema instanceof z.core.$ZodUnknown ||
      schema instanceof z.core.$ZodTransform ||
      schema instanceof z.core.$ZodCustom ||
      schema instanceof z.core.$ZodCatch ||
      schema instanceof z.core.$ZodPromise
    )
      return wildcard();
    const literal = z.core.clone(schema, {
      ...schema._zod.def,
      checks: descriptionChecks(schema),
    });
    return parsedPlan(literal, (_value, input) => literalPlan(input));
  }

  return lift(outcomeSchema);
}
