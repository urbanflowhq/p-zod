import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const value = p.probabilistic(z.number().nonnegative());
const inputs = {
  fixed: 100,
  range: p.rv.uniform({ min: 80, max: 140 }),
  likely: p.rv.triangular({ min: 80, mode: 100, max: 140 }),
  boundedNormal: p.rv.normal({ mean: 100, stddev: 15, min: 80, max: 140 }),
};
const random = seededRandom(41);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(inputs).map(([name, input]) => [
        name,
        value.sample(input, random),
      ]),
    ),
  ),
);
