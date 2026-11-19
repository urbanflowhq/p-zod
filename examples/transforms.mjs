import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const event = p.probabilistic(
  z.object({
    email: z
      .string()
      .email()
      .transform((value) => value.toLowerCase()),
    date: z.coerce.date(),
  }),
);
const description = event.parse({
  email: p.rv.categorical({ values: ["ADA@example.com", "GRACE@example.com"] }),
  date: p.rv.categorical({
    values: ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"],
  }),
});
const result = event.sample(description, seededRandom(6));
console.log(
  JSON.stringify({ email: result.email, date: result.date.toISOString() }),
);
