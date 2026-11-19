export function exampleBlocks(readme) {
  const expression =
    /<!-- example: (examples\/[a-z-]+\.mjs) -->\s*\n(`{3,})js\n([\s\S]*?)^\2[ \t]*$/gm;
  return [...readme.matchAll(expression)].map(([block, path, , code]) => ({
    block,
    path,
    code: code.trimEnd(),
  }));
}
