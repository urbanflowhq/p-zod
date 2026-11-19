import z from "zod";
import p from "../src/index.js";

const exact = p.probabilistic(z.object({ value: z.number().exactOptional() }));
const ordinary = p.probabilistic(z.object({ value: z.number().optional() }));
const omitted: p.input<typeof exact> = {};
const defined: p.input<typeof exact> = {
  value: p.rv.uniform({ min: 1, max: 2 }),
};
const allowedUndefined: p.input<typeof ordinary> = { value: undefined };
// @ts-expect-error Exact-optional descriptions reject explicit undefined.
const forbiddenUndefined: p.input<typeof exact> = { value: undefined };

void [omitted, defined, allowedUndefined, forbiddenUndefined];
