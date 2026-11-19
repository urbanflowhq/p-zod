# @urbanflow/p-zod

Schema-driven probabilistic data modeling and sampling with Zod.

Define an outcome schema, describe its random inputs, and draw validated values.
Models can combine literals, inline distributions, shared RVs, and conditional
probability tables. RV databases are plain JSON.

```ts
import z from "zod";
import p from "@urbanflow/p-zod";

const person = p.probabilistic(
  z.object({ age: z.number().int().min(18), name: z.string() }),
);
const input = person.parse({
  age: p.rv.discreteUniform({ min: 18, max: 65 }),
  name: p.rv.categorical({ values: ["Ada", "Grace"] }),
});
const result = person.sample(input);
// result: { age: number; name: string }
```

## Scope and feature status

The current scope is structured sampling and Bayesian-network forward sampling.

| Capability                                                                 | Status          |
| -------------------------------------------------------------------------- | --------------- |
| Twelve distributions, including weighted categorical choices               | Implemented     |
| Zod Classic and Mini description parsing                                   | Implemented     |
| Nested and recursive structures, native dates, maps, and sets              | Implemented     |
| Shared references with one raw value per ID per draw                       | Implemented     |
| JSON databases, conditional tables, graph and parameter validation         | Implemented     |
| Supplied seeded random sources and repeated prepared draws                 | Implemented     |
| `p.input`, `p.infer`, transforms, and async outcome validation             | Implemented     |
| Fitting from observations                                                  | Not implemented |
| Posterior inference, observations as evidence, or latent-variable learning | Not implemented |
| Parameter expressions such as a mean computed from a parent                | Not implemented |
| SciPy adapter or a versioned public JSON Schema for interchange            | Not implemented |

## Install and develop

The package is ESM and requires a compatible Zod peer. For a published package:

```sh
npm install @urbanflow/p-zod zod
```

This checkout does not publish itself. To develop locally, use Node.js 22 or newer:

```sh
npm ci
npm run check
npm run lint
npm test
```

To install the checkout into another project:

```sh
npm pack
# In the consuming project, adjust the tarball path:
npm install /path/to/urbanflow-p-zod-0.1.0.tgz zod
```

Packing checks types and rebuilds the library. The library runtime uses JavaScript
and Zod. The runnable examples below use Node.js.

## Schemas, descriptions, and databases

| Object                                                                | Purpose                           |
| --------------------------------------------------------------------- | --------------------------------- |
| Outcome schema, such as `z.object({ age: z.number() })`               | Validates a sampled result        |
| Description, such as `{ age: { type: "uniform", min: 18, max: 65 } }` | Specifies how to produce a result |
| Database, such as `{ age: { type: "uniform", min: 18, max: 65 } }`    | Names reusable random variables   |

`p.probabilistic(outcomeSchema)` connects these objects. Each described value can
be a literal, distribution, reference, or conditional. Categorical choices can
contain complete objects, arrays, or further descriptions.

There are two authoring namespaces:

```ts
p.normal(); // A Zod schema for a normal descriptor
p.rv.normal({ mean: 0, stddev: 1 }); // A plain normal descriptor
```

Schema factories validate configuration; RV builders construct configuration.
The sampling wrapper evaluates the configuration and validates the outcome.

## Parsing and sampling API

| API                                              | Behavior                                             |
| ------------------------------------------------ | ---------------------------------------------------- |
| `model.parse(input)`                             | Validates and returns a description without sampling |
| `model.safeParse(input)`                         | Returns Zod's description success or error result    |
| `model.sample(input, random?)`                   | Draws and validates an inline description            |
| `model.sample(input, database, options?)`        | Draws with named RVs                                 |
| `model.createSampler(input, random?)`            | Prepares an inline description for repeated draws    |
| `model.createSampler(input, database, options?)` | Prepares a description and database                  |
| `model.sampleAsync(...)`                         | Uses asynchronous outcome validation or transforms   |
| `model.descriptionSchema`                        | Native Zod description parser for composition        |
| `model.outcomeSchema`                            | Original Zod outcome schema                          |

`options` currently contains `{ random?: () => number }`.

Description parsing checks literal types, structure, supported built-in checks,
and distribution parameters. Every categorical alternative is parsed, including
zero-weight alternatives. References remain IDs; `.parse()` does not look them
up in a database.

Sampling preparation resolves references, checks definitions against surrounding
field schemas, and validates the database graph before consuming randomness.
Each draw then passes through the original outcome schema.

A valid description does not guarantee that every draw meets the outcome
constraints. A normal distribution can produce a value below a field's minimum.
That draw throws a Zod validation error. The wrapper does not automatically retry,
truncate, or clamp samples to satisfy an outcome schema. To bound a normal
distribution, specify `min` and/or `max` in its descriptor.

Custom refinements, defaults, preprocessors, and transforms run on the sampled
outcome. Checks affected by overwrite transforms are deferred too. Apply outcome
rules before calling `p.probabilistic()`. A refinement added to a separate
`descriptionSchema` validates configuration, not sampled results.

The wrapper is not a replacement for every Zod method. For description composition:

```ts
const age = p.probabilistic(z.number().int().min(18));
const description = z.object({ age: age.descriptionSchema });
```

There are no standalone `p.json()`, `p.sample()`, or `p.createSampler()` APIs.
Choose unconstrained JSON outcomes explicitly with `p.probabilistic(z.json())`.

### Schema compatibility

| Zod feature                                        | Description behavior                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| String-keyed objects                               | Follows fields and strip, strict, and catchall policies                 |
| Arrays and tuples                                  | Follows elements and fixed or rest positions                            |
| Records                                            | Preserves key and value rules, partial and loose modes, and symbol keys |
| Maps and sets                                      | Follows elements and checks declared collection sizes                   |
| Optional and exact-optional fields                 | Preserves absence and explicit-undefined rules                          |
| Nullable, default, prefault, and readonly wrappers | Follows inner structure; defaults and freezing apply when sampled       |
| Unions and discriminated unions                    | Accepts descriptions compatible with a branch                           |
| Intersections                                      | Checks both descriptions and samples their merged description           |
| Lazy schemas and recursive getters                 | Follows the supplied recursion                                          |
| Pipes and transforms                               | Follows the input side; checks output when sampled                      |
| Preprocessors, custom schemas, and catch schemas   | Defers opaque rules to outcome validation                               |
| Async refinements and transforms                   | Requires `.sampleAsync()`                                               |

Prepared dates are copied, and each draw gets its own date object. Opaque custom
instances retain normal JavaScript reference semantics. Databases accept only
JSON-compatible values and string IDs.

## Type inference

`p.input` describes configuration; `p.infer` describes sampled output:

```ts
const label = p.probabilistic(z.number().transform(String));
type Input = p.input<typeof label>; // Number or a source description
type Output = p.infer<typeof label>; // string

const input: Input = p.rv.normal({ mean: 10, stddev: 2 });
const output: Output = label.sample(input);
```

For ordinary Zod schemas, including distribution factories, these helpers behave
like `z.input` and `z.infer`:

```ts
const normal = p.normal();
type Normal = p.infer<typeof normal>;
// { type: "normal"; mean: number; stddev: number; min?: number; max?: number }
```

`Description<T>` exposes the recursive probabilistic form of a Zod input type.
Bounds, graph validity, and compatibility with outcome refinements remain runtime
checks. Default `p`, named `{ p }`, and namespace `* as p` imports are supported.
Raw schemas such as `normalSchema` stay internal; use the factories.

## Shared RVs and serializable networks

`p.rv.ref("price")` returns `{ type: "ref", id: "price" }`. Every reference to an
ID shares one raw value within a draw. The next `.sample()` or prepared draw
starts a fresh cache. Conditional parents use the same cache.

The canonical value is independent of the field referencing it. Outcome
transforms apply after drawing shared values. Identical inline distributions
create independent draws; use a reference to share a value.

`p.database(input)` validates and copies a plain registry:

```ts
const database = p.database({ price: p.rv.normal({ mean: 100, stddev: 10 }) });
const stored = JSON.stringify(database);
const loaded = p.database(JSON.parse(stored));
```

All database entries are validated, including unused ones. Missing IDs, invalid
parameters, unknown definition fields, non-JSON values, object cycles, and RV
dependency cycles are rejected. Missing references and dependency cycles throw
`RVError`; its `path` contains the ID chain. Data errors use `ZodError`.

Only reachable RVs are drawn. Prepared samplers retain their parsed configuration
when the original description or database changes. The wire format is currently
the database object itself, without a version envelope. Store application metadata
separately.

Distribution `type` values, `ref`, and `conditional` are reserved inside
descriptions. Malformed model nodes cannot fall back to ordinary objects.

### Conditional tables

`p.rv.match(parentId, cases, otherwise?)` accepts `[state, definition]` pairs and
emits a conditional node. For several parents, use
`p.rv.conditional({ parents, cases, otherwise? })`.

Each `when` object assigns all declared parents. Parent IDs and complete case
assignments must be unique. States are strings, finite numbers, booleans, or null;
matching uses exact scalar equality.

Parents are sampled first. An unmatched state uses `otherwise`, or throws
`RVError` when there is no fallback. Exhaustiveness is not inferred. A no-match
error occurs after drawing parents; graph and parameter errors are checked during
preparation. Tables can select continuous child distributions.

This is forward sampling from a declared directed acyclic graph, not posterior
inference from evidence.

## Runnable use cases

The examples are complete files in [examples](./examples). Run one with
`node examples/fixtures.mjs` after `npm run build`, or run all with
`npm run examples`. They import the built package.

The examples share [a seeded test RNG](./examples/random.mjs). Create a new RNG
with the same seed to repeat a run. A prepared sampler retains the RNG state
across draws. Results depend on the library version and traversal order, since
model changes can change random-number consumption.

### Describe fixed, ranged, and likely values

A numeric UI can offer these three shapes without changing the outcome schema:

| UI choice    | Stored description                                     | Meaning                                    |
| ------------ | ------------------------------------------------------ | ------------------------------------------ |
| Fixed        | `100`                                                  | Always 100                                 |
| Range        | `{ type: "uniform", min: 80, max: 140 }`               | All values in the range have equal density |
| Likely value | `{ type: "triangular", min: 80, mode: 100, max: 140 }` | Bounded values with peak density at 100    |

`mode` is the most-likely value, not the mean. A triangular distribution's mean is
`(min + mode + max) / 3`. Its mode may equal either endpoint. When all three
parameters are equal, sampling returns that constant without consuming randomness.

Normal distributions also support optional lower and upper truncation bounds.
They retain a normal-shaped density within those bounds, renormalized to that
interval. `mean` and `stddev` describe the underlying normal; the truncated
samples generally have a different mean and standard deviation.

<!-- example: examples/uncertain-values.mjs -->
```js
import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const value = p.probabilistic(z.number().nonnegative());
const inputs = {
  fixed: 100,
  range: p.rv.uniform({ min: 80, max: 140 }),
  likely: p.rv.triangular({ min: 80, mode: 100, max: 140 }),
  boundedNormal: p.rv.normal({ mean: 100, stddev: 15, min: 80, max: 140 }),
};
const random = seededRandom(41);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(inputs).map(([name, input]) => [
        name,
        value.sample(input, random),
      ]),
    ),
  ),
);
```

To supply only a lower bound, use `p.rv.normal({ mean: 100, stddev: 15, min: 0 })`;
for only an upper bound, supply `max` instead. Bounds must be finite. A positive
`stddev` requires `min < max` when both bounds are present. With `stddev: 0`, the
mean must lie inside the bounds; equal bounds at the mean are allowed. Invalid
configurations fail during description parsing, before any random draw.

### Generate API fixtures

Create structured customer records while validating age and count constraints.

<!-- example: examples/fixtures.mjs -->
```js
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
```

### Estimate inventory stockout risk

Sample uncertain demand, then calculate a business metric in ordinary JavaScript.

<!-- example: examples/inventory.mjs -->
```js
import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const day = p.probabilistic(
  z.object({ demand: z.number().int().nonnegative() }),
);
const draw = day.createSampler(
  { demand: p.rv.poisson({ lambda: 20 }) },
  seededRandom(7),
);
const stock = 25;
const days = Array.from({ length: 1000 }, () => draw());
const stockoutProbability =
  days.filter(({ demand }) => demand > stock).length / days.length;
console.log(JSON.stringify({ stock, stockoutProbability }));
```

### Keep quoted and charged prices consistent

Both fields share one price per order. The next order gets a fresh draw.

<!-- example: examples/shared-price.mjs -->
```js
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
```

### Simulate a weather network

The grass depends on the same rain RV that appears in the output.

<!-- example: examples/weather.mjs -->
```js
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
```

### Select latency distributions by route

A discrete parent selects a continuous child: mean latency is 5 milliseconds for cache requests and 100 milliseconds for origin requests.

<!-- example: examples/latency.mjs -->
```js
import p from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "./random.mjs";

const database = p.database({
  route: p.rv.categorical({
    values: ["cache", "origin"],
    weights: [0.8, 0.2],
  }),
  latency: p.rv.match("route", [
    ["cache", p.rv.exponential({ rate: 1 / 5 })],
    ["origin", p.rv.exponential({ rate: 1 / 100 })],
  ]),
});
const request = p.probabilistic(
  z.object({
    route: z.enum(["cache", "origin"]),
    latencyMs: z.number().nonnegative(),
  }),
);
const draw = request.createSampler(
  { route: p.rv.ref("route"), latencyMs: p.rv.ref("latency") },
  database,
  { random: seededRandom(21) },
);
console.log(JSON.stringify(Array.from({ length: 3 }, () => draw())));
```

### Author a table with multiple parents

One case handles dry weather with the sprinkler off. A fallback handles other combinations.

<!-- example: examples/multiple-parents.mjs -->
```js
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
```

### Sample an existing recursive structure

The description supplies the tree shape. Use categorical alternatives to vary whole arrays or subtrees. Recursive shape generation is not automatic.

<!-- example: examples/recursive-tree.mjs -->
```js
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
```

### Load parameters from an external fitting tool

This imports already-fitted parameters. No fitting happens inside p-zod.

<!-- example: examples/json-boundary.mjs -->
```js
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
```

Application-owned Python can fit a normal distribution with
[SciPy's norm.fit](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.norm.html)
and write our JSON format:

```py
import json
from scipy import stats

mean, stddev = stats.norm.fit([21.2, 22.1, 20.8, 23.0])
payload = {"temperature": {"type": "normal", "mean": float(mean), "stddev": float(stddev)}}
print(json.dumps(payload, allow_nan=False))
```

This is manual conversion, not an implemented adapter or an official SciPy
interchange standard. Map parameterizations explicitly and reject unsupported
shifts or families rather than discarding information.

### Apply transforms to sampled outcomes

Parsing preserves descriptions. Sampling applies email normalization and date coercion.

<!-- example: examples/transforms.mjs -->
```js
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
```

### Validate outcomes asynchronously

Use sampleAsync for asynchronous outcome refinements or transforms.

<!-- example: examples/async-validation.mjs -->
```js
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
```

### Handle configuration and outcome errors

Literal, outcome, and reference errors have separate validation paths. No rejection sampling occurs.

<!-- example: examples/errors.mjs -->
```js
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
```

## Distribution reference

All numeric parameters must be finite. Factories validate descriptors; builders
construct plain descriptors from the listed parameter object.

| Factory                       | Builder                                     | Parameters and support                                                      |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `p.uniform()`                 | `p.rv.uniform({ min, max })`                | `min <= max`; equal bounds give a constant                                  |
| `p.normal()`                  | `p.rv.normal({ mean, stddev, min?, max? })` | `stddev >= 0`; optional truncation bounds; zero gives the mean if in bounds |
| `p.triangular()`              | `p.rv.triangular({ min, mode, max })`       | `min <= mode <= max`; equal bounds give a constant                          |
| `p.bernoulli()`               | `p.rv.bernoulli({ p })`                     | `0 <= p <= 1`; numeric `0` or `1`                                           |
| `p.binomial()`                | `p.rv.binomial({ n, p })`                   | Safe integer `n >= 0`, `0 <= p <= 1`                                        |
| `p.poisson()`                 | `p.rv.poisson({ lambda })`                  | `lambda >= 0`; nonnegative count                                            |
| `p.exponential()`             | `p.rv.exponential({ rate })`                | `rate > 0`; mean `1 / rate`                                                 |
| `p.gamma()`                   | `p.rv.gamma({ shape, scale })`              | Both positive; mean `shape * scale`                                         |
| `p.beta()`                    | `p.rv.beta({ alpha, beta })`                | Both positive; samples between 0 and 1                                      |
| `p.discreteUniform()`         | `p.rv.discreteUniform({ min, max })`        | Inclusive safe-integer bounds and range size                                |
| `p.geometric()`               | `p.rv.geometric({ p })`                     | `0 < p <= 1`; trials through first success, from 1                          |
| `p.categorical(valueSchema?)` | `p.rv.categorical({ values, weights? })`    | Nonempty choices and relative weights                                       |

Weights must be finite, nonnegative, match the choice count, and include a positive
entry. Without weights, choices have equal probabilities. Zero-weight choices
are not drawn but their descriptions are validated.

`p.categorical()` defaults to `z.unknown()` for choices. Within a probabilistic
wrapper, alternatives follow the surrounding outcome schema instead.
`p.distribution(valueSchema?)` validates one numeric or categorical descriptor;
it does not validate a database. The reference and conditional builders are
`p.rv.ref`, `p.rv.match`, and `p.rv.conditional`.

Stored categorical choices must be JSON data. Distribution schema factories can
validate native values when given a compatible Zod schema. Low-level named
samplers, such as `sampleNormal`, take validated parameters and a valid random
source. They skip parsing and wrapper outcome validation.

### Numerical and performance limits

Sampling uses JavaScript double precision. Rounding and underflow can produce
endpoints for continuous distributions. Nonfinite numeric samples throw
`RangeError`; geometric samples also reject unsafe integer results.

The truncated normal sampler uses uniform proposals for narrow intervals,
normal rejection near the mean, and an exponential proposal for distant tails.
The tail method follows [Robert’s truncated normal sampler](https://arxiv.org/abs/0907.4010).
If a tail bound cannot be represented in standardized floating-point units,
sampling throws `RangeError` instead of entering a rejection loop.

Binomial sampling uses repeated Bernoulli trials, so cost grows with `n`. Poisson
sampling uses exponential waiting times, so expected cost grows with `lambda`.
Very large parameters are impractical. No stdlib, jStat, or SciPy sampling backend
is installed.

A random source must return finite values in `[0, 1)`. Bounds are checked for each
consumed value. Rejection samplers also need a suitable uniform random stream;
an adversarial constant stream can prevent convergence.

## Developer guide

### Source ownership

| Path                   | Responsibility                                                 |
| ---------------------- | -------------------------------------------------------------- |
| `src/p.ts`             | Default and named API, factories, type helper exports          |
| `src/probabilistic.ts` | Public parsing and sampling wrapper                            |
| `src/compile.ts`       | Zod traversal and sampling-plan preparation                    |
| `src/description.ts`   | Description types, draw context, and plan constructors         |
| `src/distributions/`   | Per-distribution schemas and samplers, plus registry           |
| `src/rv.ts`            | Plain-data authoring builders                                  |
| `src/database.ts`      | Definition validation, conditional structure, and graph checks |
| `src/json.ts`          | JSON validation and copying at the storage boundary            |
| `src/network.ts`       | Reference resolution, canonical plans, conditional draws       |
| `src/random.ts`        | RNG contract and bounds checking                               |
| `src/infer.ts`         | Input and output inference                                     |
| `test/`                | Runtime regressions and documentation checks                   |
| `type-tests/`          | Compile-time public API contracts                              |
| `examples/`            | Executable use cases                                           |

The compiler traverses Zod 4 core definitions and supports Classic and Mini. The
peer range starts at `4.6.7`; upgrading Zod requires traversal compatibility tests.
There is no standalone handwritten JSON outcome schema. The internal JSON copier
validates serializable database data only.

### Validation and execution

1. Compile the supplied outcome schema into a description parser.
2. Parse descriptions without consuming randomness.
3. Prepare supplied databases and resolve references.
4. Allocate a fresh reference cache for each draw and evaluate the prepared plan.
5. Validate and transform the result with the original outcome schema.

Keep parameter checks in distribution schemas and graph checks in database
preparation. Typed distribution samplers do not parse their inputs.

### Add a distribution

1. Add its schema, inferred type, and sampler under `src/distributions/`.
2. Register the schema and numeric dispatch in `src/distributions/index.ts` and
   `src/sample.ts`, or add the appropriate nonnumeric plan.
3. Add its factory to `src/p.ts` and builder to `src/rv.ts`.
4. Export its type and low-level sampler from `src/index.ts`, keeping raw schemas
   internal to the entry point.
5. Add failing tests for parameter limits, support, degenerate cases, and nesting.
6. Update the reference table and examples.

### Run checks and maintain examples

```sh
npm run check       # Strict source and public API type checks
npm run lint        # Biome checks
npm test            # Build, runtime tests, and README examples
npm run examples    # Build and run README examples only
npm run build       # ESM, declarations, and maps in dist/
npm run check:package # Install the tarball and check a separate TS consumer
npm pack --dry-run  # Check publishable files
```

TypeScript enables `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, and `noEmitOnError`.

Edit executable examples first, then synchronize the displayed README snippets:

```sh
npm run docs:sync
npm test
```

Documentation tests check that every use-case file appears in this README, compare
its displayed source, and execute it against the built package. The package check
installs a tarball into a temporary consumer project, compiles its TypeScript, and
runs imports and sampling through the installed package.

### Package and release

The package exposes ESM through `dist/index.js` with TypeScript declarations.
`prepack` checks types and rebuilds. The allowlist contains `dist/`; npm also
includes `package.json`, `README.md`, and `LICENSE`.

Releases use Changesets, matching `urbanflow-components`:

1. Make changes on a branch and run the checks above.
2. Run `npm run changeset`, select `@urbanflow/p-zod`, and write a consumer-facing
   release note. Use patch for compatible fixes, minor for additions, and major
   for breaking changes. For documentation or tooling changes that do not ship,
   run `npm run changeset -- --empty`.
3. Open a PR. CI runs types, lint, tests, README examples, and the installed-package
   check. It also requires a changeset, except on the bot's version PR.
4. Merge to `main`. The release bot opens or updates **Version Packages** with
   the next version and changelog.
5. Merge **Version Packages**. The bot publishes to npm and creates a GitHub
   release. Publishing runs the same validation checks first.

`npm run version-packages` applies pending changesets and synchronizes the npm
lockfile. `npm run release` publishes unpublished versions through Changesets.
Use these manually only when recovering a release. The Release workflow supports
manual dispatch to retry a failed publish without bumping the version again.

#### Initial repository and npm setup

The repository is [urbanflowhq/p-zod](https://github.com/urbanflowhq/p-zod).
GitHub Actions must be allowed to create pull requests under Settings → Actions
→ General → Workflow permissions. The release workflow uses `GITHUB_TOKEN` to
create version PRs and `id-token: write` for npm OIDC. No `NPM_TOKEN` is needed.

Before the first automated release, publish `0.1.0` interactively with an npm
account authorized for the `@urbanflow` scope:

```sh
npm login
npm publish
```

Then configure a GitHub Actions trusted publisher in the npm package settings:

| Field             | Value                                       |
| ----------------- | ------------------------------------------- |
| Organization      | `urbanflowhq`                               |
| Repository        | `p-zod`                                     |
| Workflow filename | `release.yml`                               |
| Environment       | Leave empty                                 |
| Allowed actions   | Enable direct publishing with `npm publish` |

Alternatively, after the package exists, configure it with the npm CLI:

```sh
npm trust github @urbanflow/p-zod --file release.yml --repo urbanflowhq/p-zod --allow-publish
```

npm requires two-factor authentication for this setup. The workflow uses Node 24
and npm 11, which support trusted publishing. Its publisher identity must match
exactly. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

After configuring trust, dispatch **Release** from GitHub Actions to verify it,
then include a changeset with the next package change to exercise a new publish.

## License

MIT. Copyright (c) 2026 urbanflow. See [LICENSE](./LICENSE).
