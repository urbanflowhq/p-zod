import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const customer = p.probabilistic(
  z.object({
    name: z.string(),
    age: z.number().int().min(18).max(65),
    orders: z.number().int().nonnegative(),
  }),
);
const draw = customer.createSampler(
  {
    name: p.rv.categorical({ values: ["Ada", "Grace", "Lin"] }),
    age: p.rv.discreteUniform({ min: 18, max: 65 }),
    orders: p.rv.poisson({ lambda: 3 }),
  },
  seededRandom(42),
);
const customers = Array.from({ length: 3 }, () => draw());
console.log(JSON.stringify(customers));
