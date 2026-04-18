# nx-pnpm-typescript-mono-template

Lean Nx + pnpm + TypeScript monorepo with a TanStack Start app and a Next.js 16 app pre-wired, plus a shared `sample` package. Default scope: `@repo`.

## Quick start

```bash
git clone <this-repo> my-monorepo
cd my-monorepo
node scripts/init.mjs                     # removes template-only docs/
pnpm install
pnpm check
pnpm --filter @repo/tanstack-sample dev   # port 3001
pnpm --filter @repo/next-sample dev       # port 3002
```

## What's included

| Tool            | Version | Purpose                                   |
| --------------- | ------- | ----------------------------------------- |
| Nx              | 22.6.5  | Pure task runner (no plugins)             |
| pnpm workspaces | v10     | `hoist=false`, catalog protocol           |
| TypeScript      | 6.x     | Strict, ESNext, Bundler resolution        |
| Vitest          | ^4.1    | Unit testing                              |
| oxlint          | ^1.60   | Linting (drop-in ESLint replacement)      |
| oxfmt           | ^0.45   | Formatting (drop-in Prettier replacement) |
| Sheriff         | ^0.19   | Import boundary enforcement               |
| Knip            | ^6.4    | Dead code / unused dep detection          |
| TanStack Start  | ^1.168  | `apps/tanstack-sample` (React 19 + Vite)  |
| Next.js         | ^16.0   | `apps/next-sample` (App Router)           |

## Structure

```
apps/
  tanstack-sample/   # TanStack Start app (port 3001)
  next-sample/       # Next.js 16 app (port 3002)
packages/
  sample/            # shared library, source-level export
scripts/
  init.mjs           # one-shot: deletes template-only docs/
  remove-app.mjs     # removes an app + prunes all references (accepts `all`)
  remove-all.mjs     # wipes every app + package, resets configs to a bare shell
```

## Customizing scope / package name

The template ships with `@repo/*`. To rename:

```bash
# Bulk rename via your editor's find-and-replace:
#   @repo/        → @yourscope/
#   sample        → yourpkg    (rename packages/sample/ dir too)
```

Or use `sed` on tracked files:

```bash
git grep -l '@repo/' | xargs sed -i '' 's|@repo/|@yourscope/|g'
```

## Removing an unused app

Pick one (or both) and drop the other:

```bash
node scripts/remove-app.mjs tanstack-sample    # keep only Next.js
node scripts/remove-app.mjs next-sample        # keep only TanStack Start
node scripts/remove-app.mjs all                # drop both apps (keep packages/sample)
node scripts/remove-all.mjs                    # also wipe packages/* (bare monorepo shell)
pnpm install
pnpm check
```

`remove-app.mjs` deletes `apps/<name>/` and updates:
- `tsconfig.json` references
- `vitest.workspace.ts`
- `sheriff.config.ts`
- `knip.json`
- `pnpm-workspace.yaml` catalog (prunes framework-only deps)
- runs `oxfmt` on modified files

## Commands

```bash
pnpm lint              # oxlint
pnpm format            # oxfmt (write)
pnpm format:check      # oxfmt --check
pnpm typecheck         # nx run-many -t typecheck
pnpm test              # nx run-many -t test
pnpm sheriff           # architectural boundary check
pnpm knip              # unused exports / deps
pnpm check             # lint + format:check + typecheck + sheriff + knip
pnpm build             # nx run-many -t build
pnpm dev               # nx run-many -t dev
```

## How this template is wired

See [docs/](docs/README.md) for the setup guide — pnpm workspace, TypeScript module resolution, Live Types, and the Nx + tsconfig references story.

## License

MIT
