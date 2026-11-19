import p, { RVError } from "@urbanflow/p-zod";
import z from "zod";

const age = p.probabilistic(z.number().min(18));
const parsed = age.safeParse("not a number");
let outcomeRejected = false;
let referenceRejected = false;
try {
  age.sample(p.rv.uniform({ min: 0, max: 10 }), () => 0.5);
} catch (error) {
  if (!(error instanceof z.ZodError)) throw error;
  outcomeRejected = true;
}
try {
  age.sample(p.rv.ref("missing"), {});
} catch (error) {
  if (!(error instanceof RVError)) throw error;
  referenceRejected = true;
}
console.log(
  JSON.stringify({
    literalAccepted: parsed.success,
    outcomeRejected,
    referenceRejected,
  }),
);
