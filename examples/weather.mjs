import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const database = p.database({
  rain: p.rv.categorical({ values: [true, false], weights: [0.2, 0.8] }),
  wetGrass: p.rv.match("rain", [
    [true, p.rv.categorical({ values: [true, false], weights: [0.9, 0.1] })],
    [false, p.rv.categorical({ values: [true, false], weights: [0.05, 0.95] })],
  ]),
});
const weather = p.probabilistic(
  z.object({ raining: z.boolean(), grassIsWet: z.boolean() }),
);
const draw = weather.createSampler(
  { raining: p.rv.ref("rain"), grassIsWet: p.rv.ref("wetGrass") },
  database,
  { random: seededRandom(10) },
);
console.log(JSON.stringify(Array.from({ length: 3 }, () => draw())));
