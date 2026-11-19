import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const allowed = new Set(["Ada", "Grace"]);
const name = p.probabilistic(
  z.string().refine(async (value) => allowed.has(value), "Unknown name"),
);
const result = await name.sampleAsync(
  p.rv.categorical({ values: ["Ada", "Grace"] }),
  seededRandom(17),
);
console.log(JSON.stringify({ name: result }));
