# Release notes

Add a changeset for each change to the published package:

```sh
npm run changeset
```

Choose `@urbanflow/p-zod` and a patch, minor, or major bump. Explain what changes
for consumers. For changes that do not ship, use `npm run changeset -- --empty`.

Merging to `main` updates the bot's **Version Packages** PR. Merging that PR
publishes the package through npm trusted publishing. See the README's release
guide for initial npm setup.
