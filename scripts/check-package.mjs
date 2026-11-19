import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "p-zod-package-"));
try {
  const { stdout } = await exec(
    "npm",
    ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
    { cwd: root },
  );
  const [packed] = JSON.parse(stdout);
  const files = new Set(packed.files.map((file) => file.path));
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.js",
    "dist/index.d.ts",
  ])
    assert.ok(files.has(required), required);
  for (const file of files)
    assert.ok(
      !/^(src|test|type-tests|examples|scripts|node_modules)\//.test(file),
      file,
    );

  const consumer = path.join(directory, "consumer");
  await mkdir(consumer);
  await writeFile(
    path.join(consumer, "package.json"),
    JSON.stringify({
      name: "p-zod-consumer-check",
      private: true,
      type: "module",
      dependencies: {
        "@urbanflow/p-zod": `file:${path.join(directory, packed.filename)}`,
        zod: `file:${path.join(root, "node_modules/zod")}`,
      },
    }),
  );
  await writeFile(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM"],
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        outDir: "build",
      },
      include: ["check.ts"],
    }),
  );
  await writeFile(
    path.join(consumer, "check.ts"),
    `
import z from "zod";
import p, { sampleTriangular, type Triangular, type Normal } from "@urbanflow/p-zod";

const model = p.probabilistic(z.object({ first: z.number(), second: z.number(), label: z.string().default("member") }));
const database = p.database({ price: p.rv.uniform({ min: 2, max: 2 }) });
const input: p.input<typeof model> = { first: p.rv.ref("price"), second: p.rv.ref("price") };
const loaded = p.database(JSON.parse(JSON.stringify(database)));
const output: p.infer<typeof model> = model.sample(input, loaded);
if (output.first !== 2 || output.second !== 2 || output.label !== "member") throw new Error("Unexpected consumer result");
const triangle: Triangular = p.rv.triangular({ min: 0, mode: 2, max: 8 });
if (sampleTriangular(triangle, () => 0.25) !== 2) throw new Error("Triangular export failed");
const bounded: Normal = p.rv.normal({ mean: 1, stddev: 1, min: 0, max: 2 });
const boundedResult = p.probabilistic(z.number()).sample(bounded, () => 0);
if (boundedResult < 0 || boundedResult > 2) throw new Error("Normal truncation failed");
const api = await import("@urbanflow/p-zod");
if ("normalSchema" in api) throw new Error("Internal schemas leaked into public exports");
console.log("Consumer import, declarations, shared RVs, and JSON round trip passed");
`,
  );
  await exec(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: consumer },
  );
  await exec(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "-p",
      path.join(consumer, "tsconfig.json"),
    ],
    { cwd: consumer },
  );
  const result = await exec(
    process.execPath,
    [path.join(consumer, "build/check.js")],
    { cwd: consumer },
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(consumer, "node_modules/@urbanflow/p-zod/package.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.name, "@urbanflow/p-zod");
  console.log(result.stdout.trim());
  console.log(
    `Packed ${packed.files.length} files; source, tests, examples, and scripts excluded`,
  );
  await rm(directory, { recursive: true, force: true });
} catch (error) {
  console.error(`Package-check artifacts retained at ${directory}`);
  if (error && typeof error === "object" && "stderr" in error)
    console.error(error.stderr);
  throw error;
}
