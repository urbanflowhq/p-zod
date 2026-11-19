import * as z from "zod";
import {
  conditionalSchema,
  type RVDefinition,
  RVError,
  referenceSchema,
  rvDefinitionSchema,
} from "./database.js";
import {
  parsedPlan,
  type SamplingContext,
  type SamplingPlan,
} from "./description.js";

type Lift = (schema: z.core.$ZodType) => z.ZodType<SamplingPlan>;

export function createNetworkCompiler(
  lift: Lift,
  unconstrained: z.core.$ZodType,
  database?: ReadonlyMap<string, RVDefinition>,
) {
  const canonical = new Map<string, SamplingPlan>();
  const validated = new Map<string, WeakSet<z.core.$ZodType>>();

  function definition(id: string): RVDefinition {
    const node = database?.get(id);
    if (!node) throw new RVError(`Missing RV "${id}"`, [id]);
    return node;
  }

  function canonicalPlan(id: string): SamplingPlan {
    const existing = canonical.get(id);
    if (existing) return existing;
    const plan = lift(unconstrained).parse(definition(id));
    canonical.set(id, plan);
    return plan;
  }

  function drawReference(
    id: string,
    plan: SamplingPlan,
    context: SamplingContext,
  ): unknown {
    if (context.values.has(id)) return context.values.get(id);
    const value = plan.draw(context);
    context.values.set(id, value);
    return value;
  }

  function reference(schema: z.core.$ZodType): z.ZodType<SamplingPlan> {
    return parsedPlan(referenceSchema, (value) => {
      if (database === undefined) {
        return {
          description: value,
          draw: () => {
            throw new RVError(`An RV database is required for "${value.id}"`, [
              value.id,
            ]);
          },
        };
      }
      const plan = canonicalPlan(value.id);
      if (schema !== unconstrained) {
        const checked =
          validated.get(value.id) ?? new WeakSet<z.core.$ZodType>();
        if (!checked.has(schema)) {
          lift(schema).parse(definition(value.id));
          checked.add(schema);
          validated.set(value.id, checked);
        }
      }
      return {
        description: value,
        draw: (context) => drawReference(value.id, plan, context),
      };
    });
  }

  function conditional(schema: z.core.$ZodType): z.ZodType<SamplingPlan> {
    const branch = z.transform((definition: RVDefinition, ctx) => {
      const result = lift(schema).safeParse(definition);
      if (result.success) return result.data;
      for (const issue of result.error.issues) ctx.addIssue({ ...issue });
      return z.NEVER;
    });
    return parsedPlan(
      conditionalSchema(rvDefinitionSchema.pipe(branch)),
      (value) => {
        const parents = value.parents.map(
          (id) =>
            [
              id,
              reference(unconstrained).parse({ type: "ref", id }),
            ] satisfies [string, SamplingPlan],
        );
        return {
          description: {
            type: value.type,
            parents: value.parents,
            cases: value.cases.map((entry) => ({
              when: entry.when,
              then: entry.then.description,
            })),
            ...(value.otherwise === undefined
              ? {}
              : { otherwise: value.otherwise.description }),
          },
          draw: (context) => {
            const states = new Map(
              parents.map(([id, plan]) => [id, plan.draw(context)]),
            );
            const selected = value.cases.find((entry) =>
              value.parents.every((id) => states.get(id) === entry.when[id]),
            );
            const branch = selected?.then ?? value.otherwise;
            if (!branch)
              throw new RVError(
                `No conditional case matches parent state ${JSON.stringify(Object.fromEntries(states))}`,
                value.parents,
              );
            return branch.draw(context);
          },
        };
      },
    );
  }

  return { reference, conditional };
}
