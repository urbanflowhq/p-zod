import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { exampleBlocks } from "../scripts/readme-blocks.mjs";

const exec = promisify(execFile);
const root = new URL("../", import.meta.url);
const readme = await readFile(new URL("README.md", root), "utf8");
const matches = exampleBlocks(readme);

test("README includes every executable use-case example", async () => {
  const files = (await readdir(new URL("examples/", root)))
    .filter((file) => file.endsWith(".mjs") && file !== "random.mjs")
    .map((file) => `examples/${file}`);
  assert.deepEqual(matches.map((match) => match.path).sort(), files.sort());
});
for (const { path, code: snippet } of matches) {
  test(`README example ${path}`, async () => {
    const source = (await readFile(new URL(path, root), "utf8")).trimEnd();
    assert.equal(snippet.trimEnd().replace(/\t/g, "  "), source);
    const { stdout } = await exec(process.execPath, [
      fileURLToPath(new URL(path, root)),
    ]);
    const result = JSON.parse(stdout);
    assert.notEqual(result, undefined);
    if (path.endsWith("shared-price.mjs")) {
      assert.equal(result.first.quotedPrice, result.first.chargedPrice);
      assert.equal(result.second.quotedPrice, result.second.chargedPrice);
      assert.notEqual(result.first.quotedPrice, result.second.quotedPrice);
    }
    if (path.endsWith("paired-designs.mjs")) {
      assert.equal(result.paired, result.runs);
      assert.equal(result.medianLighting, 8);
    }
    if (path.endsWith("errors.mjs")) {
      assert.deepEqual(result, {
        literalAccepted: false,
        outcomeRejected: true,
        referenceRejected: true,
      });
    }
  });
}
