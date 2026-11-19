import { readFile, writeFile } from "node:fs/promises";
import { exampleBlocks } from "./readme-blocks.mjs";

const root = new URL("../", import.meta.url);
const readmeUrl = new URL("README.md", root);
let readme = await readFile(readmeUrl, "utf8");
for (const { block, path } of exampleBlocks(readme)) {
  const source = (await readFile(new URL(path, root), "utf8")).trimEnd();
  readme = readme.replace(
    block,
    () => `<!-- example: ${path} -->\n\`\`\`js\n${source}\n\`\`\``,
  );
}
await writeFile(readmeUrl, readme);
