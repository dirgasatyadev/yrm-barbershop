import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { wrangler } from './wrangler.mjs'

const require = createRequire(import.meta.url)
const vitePackage = require.resolve('vite/package.json')
const vite = resolve(dirname(vitePackage), require(vitePackage).bin.vite)
const dryRun = process.argv.slice(2).includes('--dry-run')
const env = { ...process.env, CLOUDFLARE_ENV: 'production' }
for (const args of [[vite, 'build'], [wrangler, 'deploy', ...(dryRun ? ['--dry-run'] : [])]]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
