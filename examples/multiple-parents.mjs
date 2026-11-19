import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const database = p.database({
  rain: p.rv.categorical({ values: [true, false] }),
  sprinkler: p.rv.categorical({ values: [true, false] }),
  wet: p.rv.conditional({
    parents: ["rain", "sprinkler"],
    cases: [
      {
        when: { rain: false, sprinkler: false },
        then: p.rv.categorical({ values: [false] }),
      },
    ],
    otherwise: p.rv.categorical({ values: [true] }),
  }),
});
const wet = p.probabilistic(z.boolean());
const result = wet.sample(p.rv.ref("wet"), database, {
  random: seededRandom(3),
});
console.log(JSON.stringify({ wet: result }));
