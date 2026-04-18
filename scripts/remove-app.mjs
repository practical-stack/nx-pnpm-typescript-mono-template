#!/usr/bin/env node
// @ts-check
// Remove an app from the monorepo cleanly.
//   Deletes apps/<name>/
//   Updates tsconfig.json references
//   Updates vitest.workspace.ts
//   Updates sheriff.config.ts
//   Updates knip.json
//   Cleans catalog entries in pnpm-workspace.yaml that no other app uses
// Usage: node scripts/remove-app.mjs <app-name>

import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '..',
)

const TANSTACK_ONLY_CATALOG = [
  '@tanstack/react-router',
  '@tanstack/react-router-devtools',
  '@tanstack/react-start',
  '@tailwindcss/vite',
  'tailwindcss',
  '@vitejs/plugin-react',
  'vite',
  'vite-tsconfig-paths',
  '@testing-library/jest-dom',
  '@testing-library/react',
  'jsdom',
]

const NEXT_ONLY_CATALOG = ['next', '@types/node']

function main() {
  const appName = process.argv[2]
  if (!appName) {
    console.error('Usage: node scripts/remove-app.mjs <app-name>')
    process.exit(1)
  }

  const appDir = path.join(ROOT, 'apps', appName)
  if (!fs.existsSync(appDir)) {
    console.error(`App "${appName}" not found at ${appDir}`)
    process.exit(1)
  }

  console.log(`Removing apps/${appName}/ ...`)
  fs.rmSync(appDir, { recursive: true, force: true })

  updateTsconfig(appName)
  updateVitestWorkspace(appName)
  updateSheriff(appName)
  updateKnip(appName)
  pruneCatalog(appName)
  runFormatter()

  console.log('\nDone. Next steps:')
  console.log('  pnpm install')
  console.log('  pnpm check')
}

function runFormatter() {
  try {
    execSync('pnpm exec oxfmt -c .oxfmtrc.json', { cwd: ROOT, stdio: 'ignore' })
    console.log(`  ran oxfmt on modified files`)
  } catch {
    // oxfmt not installed yet (user hasn't run `pnpm install` since init) — skip silently.
  }
}

function updateTsconfig(appName) {
  const file = path.join(ROOT, 'tsconfig.json')
  if (!fs.existsSync(file)) return
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (Array.isArray(json.references)) {
    json.references = json.references.filter((r) => r.path !== `apps/${appName}`)
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
    console.log(`  updated tsconfig.json`)
  }
}

function updateVitestWorkspace(appName) {
  const file = path.join(ROOT, 'vitest.workspace.ts')
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  const updated = text
    .replace(new RegExp(`,\\s*['"]apps/${appName}['"]`, 'g'), '')
    .replace(new RegExp(`['"]apps/${appName}['"]\\s*,?\\s*`, 'g'), '')
  if (updated !== text) {
    fs.writeFileSync(file, updated)
    console.log(`  updated vitest.workspace.ts`)
  }
}

function updateSheriff(appName) {
  const file = path.join(ROOT, 'sheriff.config.ts')
  if (!fs.existsSync(file)) return
  let text = fs.readFileSync(file, 'utf8')
  const tag = `app:${appName}`
  // Remove entryPoints key line
  text = text.replace(new RegExp(`\\s*'${appName}':\\s*'[^']+',?\\n`, 'g'), '\n')
  // Remove modules entries referring to this app
  text = text.replace(new RegExp(`\\s*'apps/${appName}/[^']+':\\s*'${tag}',?\\n`, 'g'), '\n')
  // Remove tag entry in root array
  text = text.replace(new RegExp(`'${tag}',\\s*`, 'g'), '')
  fs.writeFileSync(file, text)
  console.log(`  updated sheriff.config.ts`)
}

function updateKnip(appName) {
  const file = path.join(ROOT, 'knip.json')
  if (!fs.existsSync(file)) return
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (json.workspaces && json.workspaces[`apps/${appName}`]) {
    delete json.workspaces[`apps/${appName}`]
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
    console.log(`  updated knip.json`)
  }
}

function pruneCatalog(appName) {
  const file = path.join(ROOT, 'pnpm-workspace.yaml')
  if (!fs.existsSync(file)) return
  const remaining = listRemainingApps().filter((a) => a !== appName)

  let keysToDrop = []
  if (appName === 'tanstack-sample' && !remaining.includes('tanstack-sample')) {
    keysToDrop = keysToDrop.concat(TANSTACK_ONLY_CATALOG)
  }
  if (appName === 'next-sample' && !remaining.includes('next-sample')) {
    keysToDrop = keysToDrop.concat(NEXT_ONLY_CATALOG)
  }
  // If no React app remains, drop react core too
  if (!remaining.some((a) => a === 'tanstack-sample' || a === 'next-sample')) {
    keysToDrop = keysToDrop.concat(['react', 'react-dom', '@types/react', '@types/react-dom'])
  }

  if (keysToDrop.length === 0) return

  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const filtered = lines.filter((line) => {
    for (const key of keysToDrop) {
      const re = new RegExp(`^\\s+['"]?${escapeRegex(key)}['"]?\\s*:`)
      if (re.test(line)) return false
    }
    return true
  })
  fs.writeFileSync(file, filtered.join('\n'))
  console.log(`  pruned ${keysToDrop.length} catalog entries from pnpm-workspace.yaml`)
}

function listRemainingApps() {
  const appsDir = path.join(ROOT, 'apps')
  if (!fs.existsSync(appsDir)) return []
  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

main()
