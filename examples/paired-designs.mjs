import p, { quantile } from "@urbanflow/p-zod";
import z from "zod";

const runs = 1000;
// One stratified uniform per RV ID and draw, rotated by a hash of the ID.
function rotation(id) {
  let hash = 2166136261;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 2 ** 32;
}
const uniform = (id, draw) => ((draw + 0.5) / runs + rotation(id)) % 1;

const database = p.database({
  lighting: p.rv.normal({ mean: 8, stddev: 1.5, min: 4, max: 12 }),
  occupancy: p.rv.triangular({ min: 0.05, mode: 0.1, max: 0.2 }),
  glazing: p.rv.uniform({ min: 0.3, max: 0.6 }),
});
const baseline = p
  .probabilistic(z.object({ lighting: z.number(), occupancy: z.number() }))
  .createSampler(
    { lighting: p.rv.ref("lighting"), occupancy: p.rv.ref("occupancy") },
    database,
    { uniform },
  );
const glazed = p
  .probabilistic(
    z.object({
      glazing: z.number(),
      lighting: z.number(),
      occupancy: z.number(),
    }),
  )
  .createSampler(
    {
      glazing: p.rv.ref("glazing"),
      lighting: p.rv.ref("lighting"),
      occupancy: p.rv.ref("occupancy"),
    },
    database,
    { uniform },
  );
let paired = 0;
for (let draw = 0; draw < runs; draw++) {
  const before = baseline();
  const after = glazed();
  if (
    before.lighting === after.lighting &&
    before.occupancy === after.occupancy
  )
    paired++;
}
const medianLighting = quantile(database.lighting, 0.5);
console.log(JSON.stringify({ runs, paired, medianLighting }));
