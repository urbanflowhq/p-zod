import * as z from "zod";
import {
  type Categorical,
  categoricalSchema,
} from "./distributions/categorical.js";
import {
  distributionTag,
  type NumericDistribution,
  numericDistributionSchema,
} from "./distributions/index.js";
import { jsonDataSchema } from "./json.js";

export const referenceSchema = z.strictObject({
  type: z.literal("ref"),
  id: z.string().min(1),
});
export type Reference = z.infer<typeof referenceSchema>;
export type RVState = string | number | boolean | null;
export interface ConditionalRV {
  type: "conditional";
  parents: string[];
  cases: { when: Record<string, RVState>; then: RVDefinition }[];
  otherwise?: RVDefinition | undefined;
}
export type RVDefinition =
  | NumericDistribution
  | Categorical<z.JSONType>
  | Reference
  | ConditionalRV;
export type RVDatabase = Record<string, RVDefinition>;

const stateSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const [firstNumeric, ...otherNumeric] = numericDistributionSchema.options;
const databaseNumericSchema = z.discriminatedUnion("type", [
  firstNumeric.strict(),
  ...otherNumeric.map((schema) => schema.strict()),
]);
const statesSchema = z.transform((input, ctx): Record<string, RVState> => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    ctx.addIssue({ code: "custom", message: "Expected a parent-state object" });
    return {};
  }
  const entries: [string, RVState][] = [];
  for (const [key, value] of Object.entries(input)) {
    const result = stateSchema.safeParse(value);
    if (result.success) entries.push([key, result.data]);
    else
      for (const issue of result.error.issues)
        ctx.addIssue({ ...issue, path: [key, ...issue.path] });
  }
  return Object.fromEntries(entries);
});

export function conditionalSchema<Value extends z.core.$ZodType>(
  valueSchema: Value,
) {
  return z
    .strictObject({
      type: z.literal("conditional"),
      parents: z.array(z.string().min(1)).nonempty(),
      cases: z
        .array(
          z.strictObject({
            when: statesSchema,
            then: valueSchema,
          }),
        )
        .nonempty(),
      otherwise: z.optional(valueSchema),
    })
    .superRefine((value, ctx) => {
      const parents = new Set(value.parents);
      if (parents.size !== value.parents.length)
        ctx.addIssue({
          code: "custom",
          path: ["parents"],
          message: "Conditional parents must be unique",
        });
      const states = new Set<string>();
      for (const [index, entry] of value.cases.entries()) {
        const keys = Object.keys(entry.when);
        if (
          keys.length !== parents.size ||
          keys.some((key) => !parents.has(key))
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["cases", index, "when"],
            message: "Each case must assign exactly the declared parents",
          });
        }
        const state = JSON.stringify(
          value.parents.map((parent) => entry.when[parent]),
        );
        if (states.has(state))
          ctx.addIssue({
            code: "custom",
            path: ["cases", index],
            message: "Conditional states must be unique",
          });
        states.add(state);
      }
    });
}

export const rvDefinitionSchema: z.ZodType<RVDefinition> = z.lazy(() =>
  z.union([
    databaseNumericSchema,
    categoricalSchema(jsonDataSchema).strict(),
    referenceSchema,
    conditionalSchema(rvDefinitionSchema),
  ]),
);

export class RVError extends Error {
  constructor(
    message: string,
    readonly path: readonly string[] = [],
  ) {
    super(path.length ? `${message} (${path.join(" -> ")})` : message);
    this.name = "RVError";
  }
}

function dependencies(value: z.JSONType, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const child of value) dependencies(child, ids);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (value.type === "ref") {
    ids.add(referenceSchema.parse(value).id);
    return;
  }
  if (value.type === "conditional") {
    const node = conditionalSchema(rvDefinitionSchema).parse(value);
    for (const parent of node.parents) ids.add(parent);
    for (const entry of node.cases)
      dependencies(jsonDataSchema.parse(entry.then), ids);
    if (node.otherwise !== undefined)
      dependencies(jsonDataSchema.parse(node.otherwise), ids);
    return;
  }
  const tag = distributionTag(value);
  if (tag === "categorical") categoricalSchema(jsonDataSchema).parse(value);
  else if (tag !== undefined) databaseNumericSchema.parse(value);
  for (const child of Object.values(value)) dependencies(child, ids);
}

export function parseDatabase(input: unknown): RVDatabase {
  const source = z
    .custom<Record<string, unknown>>(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null),
      "Expected an RV database object",
    )
    .parse(jsonDataSchema.parse(input));
  const entries: [string, RVDefinition][] = Object.entries(source).map(
    ([id, node]) => [
      z.string().min(1).parse(id),
      rvDefinitionSchema.parse(node),
    ],
  );
  const parsed = Object.fromEntries(entries);
  const graph = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(parsed)) {
    const parents = new Set<string>();
    dependencies(jsonDataSchema.parse(node), parents);
    graph.set(id, parents);
  }
  const done = new Set<string>();
  const active = new Set<string>();
  function visit(id: string, path: string[]): void {
    if (active.has(id))
      throw new RVError("Cyclic RV dependency", [...path, id]);
    if (done.has(id)) return;
    const parents = graph.get(id);
    if (!parents) throw new RVError(`Missing RV "${id}"`, [...path, id]);
    active.add(id);
    for (const parent of parents) visit(parent, [...path, id]);
    active.delete(id);
    done.add(id);
  }
  for (const id of graph.keys()) visit(id, []);
  return parsed;
}

export function database<const Entries extends RVDatabase>(
  entries: Entries,
): Entries;
export function database(entries: unknown): RVDatabase;
export function database(entries: unknown): RVDatabase {
  return parseDatabase(entries);
}
