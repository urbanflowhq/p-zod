import assert from "node:assert/strict";
import test from "node:test";
import p, {
  quantile,
  RVError,
  UnsupportedQuantileError,
} from "@urbanflow/p-zod";
import z from "zod";
import { seededRandom } from "../examples/random.mjs";

const rv = p.rv;
const record = p.probabilistic(z.record(z.string(), z.unknown()));
const noRandom = () => {
  throw new Error("Unexpected random draw");
};

// A deterministic uniform per (RV ID, draw index), standing in for a keyed
// quasi-random sequence.
function keyedUniform(id, draw) {
  let hash = 2166136261 ^ draw;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) + 0.5) / 2 ** 32;
}

const archetype = {
  kind: rv.categorical({ values: ["office", "retail"], weights: [3, 1] }),
  lpd: rv.normal({ mean: 8, stddev: 1.5, min: 4, max: 12 }),
  occupancy: rv.match("kind", [
    ["office", rv.triangular({ min: 0.05, mode: 0.1, max: 0.2 })],
    ["retail", rv.uniform({ min: 0.2, max: 0.5 })],
  ]),
  alias: rv.ref("lpd"),
};

test("supplied uniforms keep shared RV draws when another RV is added", () => {
  const base = record.createSampler(
    { lpd: rv.ref("lpd"), occupancy: rv.ref("occupancy") },
    archetype,
    { uniform: keyedUniform },
  );
  const extended = record.createSampler(
    {
      extra: rv.ref("extra"),
      occupancy: rv.ref("occupancy"),
      lpd: rv.ref("lpd"),
      alias: rv.ref("alias"),
    },
    { ...archetype, extra: rv.exponential({ rate: 1 }) },
    { uniform: keyedUniform },
  );
  const kinds = new Set();
  for (let draw = 0; draw < 200; draw++) {
    const left = base();
    const right = extended();
    assert.equal(right.lpd, left.lpd);
    assert.equal(right.occupancy, left.occupancy);
    assert.equal(right.alias, right.lpd);
    assert.equal(
      right.extra,
      quantile(rv.exponential({ rate: 1 }), keyedUniform("extra", draw)),
    );
    kinds.add(right.occupancy < 0.2 ? "office" : "retail");
  }
  assert.deepEqual(kinds, new Set(["office", "retail"]));
});

test("each RV value is the quantile of its own uniform", () => {
  const draw = record.createSampler(
    { lpd: rv.ref("lpd"), occupancy: rv.ref("occupancy") },
    archetype,
    { random: noRandom, uniform: keyedUniform },
  );
  for (let index = 0; index < 50; index++) {
    const kind = quantile(archetype.kind, keyedUniform("kind", index));
    const occupancy =
      kind === "office"
        ? rv.triangular({ min: 0.05, mode: 0.1, max: 0.2 })
        : rv.uniform({ min: 0.2, max: 0.5 });
    assert.deepEqual(draw(), {
      lpd: quantile(archetype.lpd, keyedUniform("lpd", index)),
      occupancy: quantile(occupancy, keyedUniform("occupancy", index)),
    });
  }
});

test("prepared draws pass their index and request each RV once per draw", () => {
  const calls = [];
  const uniform = (id, draw) => {
    calls.push([id, draw]);
    return 0.5;
  };
  const input = { a: rv.ref("lpd"), b: rv.ref("lpd"), c: rv.ref("alias") };
  const draw = record.createSampler(input, archetype, { uniform });
  draw();
  draw();
  assert.deepEqual(calls, [
    ["lpd", 0],
    ["lpd", 1],
  ]);
  calls.length = 0;
  record.sample(input, archetype, { uniform });
  record.sample(input, archetype, { uniform });
  assert.deepEqual(calls, [
    ["lpd", 0],
    ["lpd", 0],
  ]);
});

test("inline distributions keep consuming the random stream", () => {
  const inline = rv.normal({ mean: 0, stddev: 1 });
  const alone = record.sample({ inline }, seededRandom(3));
  const mixed = record.sample({ inline, lpd: rv.ref("lpd") }, archetype, {
    random: seededRandom(3),
    uniform: keyedUniform,
  });
  assert.equal(mixed.inline, alone.inline);
  assert.equal(mixed.lpd, quantile(archetype.lpd, keyedUniform("lpd", 0)));
});

test("supplied uniforms reject RVs they cannot invert", () => {
  const options = { uniform: () => 0.25 };
  assert.throws(
    () =>
      record.sample(
        { mixture: rv.ref("mixture") },
        {
          mixture: rv.categorical({
            values: [rv.normal({ mean: 0, stddev: 1 }), 1],
          }),
        },
        options,
      ),
    (error) => error instanceof RVError && error.path.join() === "mixture",
  );
  assert.throws(
    () =>
      record.sample(
        { size: rv.ref("size") },
        { size: rv.gamma({ shape: 2, scale: 1 }) },
        options,
      ),
    UnsupportedQuantileError,
  );
  for (const uniform of [-0.1, 1, NaN]) {
    assert.throws(
      () =>
        record.sample({ lpd: rv.ref("lpd") }, archetype, {
          uniform: () => uniform,
        }),
      { name: "RangeError", message: "Uniform must be a number in [0, 1)" },
    );
  }
  assert.throws(
    () =>
      record.sample(
        { x: rv.ref("x") },
        { x: rv.normal({ mean: 0, stddev: 1 }) },
        { uniform: () => 0 },
      ),
    { name: "RangeError", message: "Sampled JSON numbers must be finite" },
  );
});

test("sampling without supplied uniforms is unchanged", () => {
  const model = p.probabilistic(
    z.object({ lpd: z.number(), occupancy: z.number(), noise: z.number() }),
  );
  const draw = model.createSampler(
    {
      lpd: rv.ref("lpd"),
      occupancy: rv.ref("occupancy"),
      noise: rv.normal({ mean: 0, stddev: 1 }),
    },
    archetype,
    { random: seededRandom(5) },
  );
  // Values recorded from @urbanflow/p-zod 0.2.0 with the same seed.
  assert.deepEqual(
    [draw(), draw(), draw()],
    [
      {
        lpd: 7.8757760284971905,
        occupancy: 0.15303438395789165,
        noise: -1.0147462964454286,
      },
      {
        lpd: 8.321702013310478,
        occupancy: 0.15567845004787745,
        noise: 0.19381982555716387,
      },
      {
        lpd: 6.913500514023849,
        occupancy: 0.15181704538563962,
        noise: -0.8621328221518009,
      },
    ],
  );
});
