import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { join } from 'node:path'
import { passwordHash } from '../src/server/services/crypto.ts'
import { wrangler } from './wrangler.mjs'

const args = process.argv.slice(2)
const remote = args.length === 1 && args[0] === '--remote'
if ((args.length && !remote) || !process.stdin.isTTY) {
  console.error('Jalankan secara interaktif: npm run admin:create [-- --remote]')
  process.exit(1)
}

let muted = false
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk)
    done()
  },
})
const input = createInterface({ input: process.stdin, output, terminal: true })
input.on('SIGINT', () => { input.close(); process.exit(130) })
async function hidden(label) {
  process.stdout.write(label)
  muted = true
  try { return await input.question('') }
  finally { muted = false; process.stdout.write('\n') }
}
let username, email, hash
try {
  username = (await input.question('Username admin: ')).trim().toLowerCase()
  email = (await input.question('Email admin: ')).trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) || email.length > 254 || !/^[\w.!#$%&'*+/=?^\x60{|}~-]+@[\w.-]+\.[a-z]{2,}$/i.test(email)) {
    throw new Error('Gunakan username alfanumerik minimal 3 karakter dan email yang valid.')
  }
  const password = await hidden('Kata sandi (minimal 14 karakter): ')
  const confirmation = await hidden('Ulangi kata sandi: ')
  if (password !== confirmation || password.length < 14 || password.length > 256) throw new Error('Kata sandi harus cocok dan terdiri dari 14–256 karakter.')
  hash = await passwordHash(password)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { input.close() }

if (hash) {
  const quote = (value) => "'" + value.replaceAll("'", "''") + "'"
  const scratch = join(process.cwd(), '.wrangler')
  await mkdir(scratch, { recursive: true })
  const directory = await mkdtemp(join(scratch, 'bootstrap-'))
  try {
    const file = join(directory, 'admin.sql')
    const id = crypto.randomUUID()
    await writeFile(file, `INSERT INTO admins (id, username, email, password_hash)
      SELECT ${[id, username, email, hash].map(quote).join(', ')}
      WHERE NOT EXISTS (SELECT 1 FROM admins)
      RETURNING id;`, { mode: 0o600 })
    const target = remote ? ['--remote', '--env', 'production'] : ['--local']
    const base = [wrangler, 'd1', 'execute', 'DB', '--config', 'wrangler.jsonc', ...target, '--json']
    const execute = (args) => spawnSync(process.execPath, [...base, ...args], {
      encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    })
    const result = execute(['--file', file, ...(remote ? ['--yes'] : [])])
    // D1 remote imports return a summary instead of the rows from RETURNING.
    const verification = remote ? execute(['--command', "SELECT id FROM admins WHERE id = '" + id + "'"]) : result
    if (verification.status !== 0) throw new Error('Pembuatan admin belum dapat diverifikasi. Periksa migrasi dan akses database.')
    const rows = JSON.parse(verification.stdout)
    if (!rows.some((row) => row.results?.some((entry) => entry.id === id))) {
      if (result.status !== 0) throw new Error('Pembuatan admin gagal. Pastikan migrasi sudah dijalankan dan akses database tersedia.')
      throw new Error('Database sudah memiliki admin. Bootstrap hanya dapat digunakan untuk admin pertama.')
    }
    process.stdout.write('Admin pertama berhasil dibuat.\n')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await rm(directory, { recursive: true })
  }
}
