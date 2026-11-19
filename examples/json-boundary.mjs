import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

// An external fitting tool can produce this application-owned JSON format.
const fittedJson = JSON.stringify({
  temperature: { type: "normal", mean: 22.1, stddev: 1.4 },
});
const database = p.database(JSON.parse(fittedJson));
const temperature = p.probabilistic(z.number());
const draw = temperature.createSampler(p.rv.ref("temperature"), database, {
  random: seededRandom(23),
});
const serializedAgain = JSON.stringify(database);
console.log(JSON.stringify({ samples: [draw(), draw()], serializedAgain }));
