#!/usr/bin/env node
// @ts-check
// Full reset: wipe every app AND every package, rewrite shared configs to a bare shell.
//   Deletes apps/*/ and packages/*/
//   Resets tsconfig.json, vitest.workspace.ts, sheriff.config.ts, knip.json
//   Prunes pnpm-workspace.yaml catalog to only entries the repo root still uses
// Usage: node scripts/remove-all.mjs

import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '..',
)

// Catalog keys kept because the repo root's package.json or packages/sample still references them.
// After remove-all, only root references remain, so keep the root's catalog: deps.
const ROOT_CATALOG_KEEP = ['typescript', 'vitest', '@vitest/coverage-v8']

function main() {
  removeSubdirs('apps')
  removeSubdirs('packages')
  resetTsconfig()
  resetVitestWorkspace()
  resetSheriff()
  resetKnip()
  pruneCatalogToRoot()
  runFormatter()

  console.log('\nDone. Next steps:')
  console.log('  pnpm install')
}

function removeSubdirs(name) {
  const dir = path.join(ROOT, name)
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const target = path.join(dir, entry.name)
    fs.rmSync(target, { recursive: true, force: true })
    console.log(`  removed ${name}/${entry.name}/`)
  }
}

function resetTsconfig() {
  const file = path.join(ROOT, 'tsconfig.json')
  if (!fs.existsSync(file)) return
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  json.references = []
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  console.log('  reset tsconfig.json references')
}

function resetVitestWorkspace() {
  const file = path.join(ROOT, 'vitest.workspace.ts')
  if (!fs.existsSync(file)) return
  fs.writeFileSync(file, 'export default []\n')
  console.log('  reset vitest.workspace.ts')
}

function resetSheriff() {
  const file = path.join(ROOT, 'sheriff.config.ts')
  if (!fs.existsSync(file)) return
  const content = `import { SheriffConfig } from '@softarc/sheriff-core'

export const config: SheriffConfig = {
  enableBarrelLess: true,

  entryPoints: {},

  modules: {},

  depRules: {
    root: ['noTag'],
    noTag: ['noTag'],
  },
}
`
  fs.writeFileSync(file, content)
  console.log('  reset sheriff.config.ts')
}

function resetKnip() {
  const file = path.join(ROOT, 'knip.json')
  if (!fs.existsSync(file)) return
  const json = {
    $schema: 'https://unpkg.com/knip@6/schema.json',
    ignoreFiles: ['sheriff.config.ts'],
    workspaces: {
      '.': {
        ignoreDependencies: ['@vitest/coverage-v8', 'vitest'],
      },
    },
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  console.log('  reset knip.json')
}

function pruneCatalogToRoot() {
  const file = path.join(ROOT, 'pnpm-workspace.yaml')
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  let inCatalog = false
  const out = []
  for (const line of lines) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true
      out.push(line)
      continue
    }
    if (inCatalog) {
      // A non-empty line with no leading whitespace ends the catalog block.
      if (line.length > 0 && !/^\s/.test(line)) {
        inCatalog = false
        out.push(line)
        continue
      }
      const m = line.match(/^\s+['"]?([^'":]+?)['"]?\s*:/)
      if (m && !ROOT_CATALOG_KEEP.includes(m[1])) continue
    }
    out.push(line)
  }
  fs.writeFileSync(file, out.join('\n'))
  console.log('  pruned pnpm-workspace.yaml catalog')
}

function runFormatter() {
  try {
    execSync('pnpm exec oxfmt -c .oxfmtrc.json', { cwd: ROOT, stdio: 'ignore' })
    console.log('  ran oxfmt')
  } catch {
    // oxfmt not installed yet — skip silently.
  }
}

main()
