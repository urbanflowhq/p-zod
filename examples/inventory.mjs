import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const day = p.probabilistic(
  z.object({ demand: z.number().int().nonnegative() }),
);
const draw = day.createSampler(
  { demand: p.rv.poisson({ lambda: 20 }) },
  seededRandom(7),
);
const stock = 25;
const days = Array.from({ length: 1000 }, () => draw());
const stockoutProbability =
  days.filter(({ demand }) => demand > stock).length / days.length;
console.log(JSON.stringify({ stock, stockoutProbability }));
