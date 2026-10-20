# Next.js ESLint root directory glob adapter

This private local package replaces `fast-glob` **only underneath
`@next/eslint-plugin-next`** through the root `package.json` npm override.
It is used during linting and is not application runtime code.

The root development dependency `fast-glob: file:tools/next-eslint-glob` anchors
the local path. The nested override references it as `$fast-glob`. This avoids
npm resolving a relative `file:` override underneath the Next.js plugin folder.
Keep the local development dependency and scoped override together.

Next.js 16.3.8 has one `fast-glob` call:
[`get-root-dirs.ts`](https://github.com/vercel/next.js/blob/v16.3.8/packages/eslint-plugin-next/src/utils/get-root-dirs.ts)
uses `globSync(pattern, { onlyDirectories: true })` to resolve
`settings.next.rootDir`. This adapter intentionally exports only that method.
It does not claim to implement the complete `fast-glob` API.

`fast-glob` pulls in `micromatch` and `braces`, for which
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no patched registry release as of 2026-10-20. The adapter removes that
dependency chain and delegates matching to `tinyglobby@0.2.17` instead.
No audit warnings are suppressed.

The adapter always sets `expandDirectories: false`, as required by the
[tinyglobby migration guidance](https://superchupu.dev/tinyglobby/documentation#expanddirectories),
to preserve `fast-glob` matching of literal directory paths. Other options,
including `onlyDirectories`, are forwarded. It also preserves absolute pattern
results, removes directory marker slashes, and keeps trailing globstars from
including their base directory, matching the original root discovery behavior.
Absolute paths spelling the current directory as `/.` or `/./` are normalized
for matching while retaining their original result spelling. Matching directory
symlinks already encountered by tinyglobby's traversal are added to the results;
the underlying traversal and its cycle protection remain in use. `picomatch`
is a direct dependency for that matching step, using the same matcher as
tinyglobby.

Run `node scripts/selftest-eslint-glob.mjs` after `npm ci`. The tests check the
installed override, directory matching, deeply nested brace input, and the
actual Next.js ESLint rule with `settings.next.rootDir`.

When updating `eslint-config-next` or `@next/eslint-plugin-next`, check its
`fast-glob` imports and calls again. Remove this adapter once the upstream
dependency chain has a compatible fix; do not reuse it for unrelated consumers.
