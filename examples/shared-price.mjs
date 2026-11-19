import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const order = p.probabilistic(
  z.object({ quotedPrice: z.number(), chargedPrice: z.number() }),
);
const database = p.database({
  price: p.rv.uniform({ min: 80, max: 120 }),
});
const draw = order.createSampler(
  { quotedPrice: p.rv.ref("price"), chargedPrice: p.rv.ref("price") },
  database,
  { random: seededRandom(4) },
);
const first = draw();
const second = draw();
console.log(JSON.stringify({ first, second }));
