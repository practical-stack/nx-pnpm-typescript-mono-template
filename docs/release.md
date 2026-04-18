# Releasing packages with nx release

This template does not include a release workflow by default. All packages have `"private": true`. Follow these steps to opt into `nx release` for publishing to npm.

## 1. Mark packages as public

In each `packages/<pkg>/package.json` you want to publish, remove `"private": true` (or set it to `false`):

```json
{
  "name": "@scope/pkg",
  "version": "0.1.0"
}
```

## 2. Add a `release` block to nx.json

```json
{
  "release": {
    "projects": ["packages/*"],
    "version": {
      "conventionalCommits": true
    },
    "changelog": {
      "workspaceChangelog": {
        "createRelease": "github"
      }
    }
  }
}
```

Adjust `projects` to match whichever packages you want to publish.

## 3. Configure the NPM_TOKEN secret

In your GitHub repository settings, add a secret named `NPM_TOKEN` with a valid npm automation token. This is used by the release workflow to authenticate with the npm registry.

## 4. Dry-run first

Always verify before publishing:

```bash
pnpm nx release --dry-run
```

Review the version bumps, changelog entries, and git tags that would be created.

## 5. Publish

```bash
pnpm nx release
```

This will:
1. Bump versions according to conventional commits
2. Update `CHANGELOG.md`
3. Create a git tag
4. Publish packages to npm
5. Create a GitHub release (if `createRelease: "github"` is set)

## 6. Optional: scaffold a release.yml workflow

To automate releases on push to `main`, create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm nx release
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> This is a docs-only pointer. No release scripts are bundled in the template.
