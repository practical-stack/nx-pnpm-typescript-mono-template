#!/usr/bin/env node
// @ts-check
// Initialize a project from this template.
//   Deletes docs/ (template-only setup guide)
// Usage: node scripts/init.mjs

import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  '..',
)

function main() {
  const docsDir = path.join(ROOT, 'docs')
  if (fs.existsSync(docsDir)) {
    fs.rmSync(docsDir, { recursive: true, force: true })
    console.log('  removed docs/')
  } else {
    console.log('  docs/ already removed')
  }

  console.log('\nDone.')
}

main()
