import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const database = p.database({
  route: p.rv.categorical({
    values: ["cache", "origin"],
    weights: [0.8, 0.2],
  }),
  latency: p.rv.match("route", [
    ["cache", p.rv.exponential({ rate: 1 / 5 })],
    ["origin", p.rv.exponential({ rate: 1 / 100 })],
  ]),
});
const request = p.probabilistic(
  z.object({
    route: z.enum(["cache", "origin"]),
    latencyMs: z.number().nonnegative(),
  }),
);
const draw = request.createSampler(
  { route: p.rv.ref("route"), latencyMs: p.rv.ref("latency") },
  database,
  { random: seededRandom(21) },
);
console.log(JSON.stringify(Array.from({ length: 3 }, () => draw())));
