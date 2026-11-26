import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const packagePath = require.resolve('wrangler/package.json')
export const wrangler = resolve(dirname(packagePath), require(packagePath).bin.wrangler)
