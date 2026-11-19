import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const node = z.object({
  name: z.string(),
  cost: z.number().nonnegative(),
  get children() {
    return z.array(node);
  },
});
const tree = p.probabilistic(node);
const input = tree.parse({
  name: "assembly",
  cost: p.rv.uniform({ min: 5, max: 10 }),
  children: [
    {
      name: p.rv.categorical({ values: ["small part", "large part"] }),
      cost: p.rv.gamma({ shape: 2, scale: 3 }),
      children: [],
    },
  ],
});
console.log(JSON.stringify(tree.sample(input, seededRandom(9))));
