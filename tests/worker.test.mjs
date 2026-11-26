import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { build } from 'esbuild'
import { addDays, monday, today } from '../src/shared/time.ts'
import { passwordHash } from '../src/server/services/crypto.ts'

const day = addDays(today(), 10)
const password = 'Integration test password with sufficient length'
const booking = (barber_id = 'capster-a', start = 600) => ({ date: day, start, barber_id, service_id: 'potong-rambut', customer_name: 'Pelanggan Uji' })

test('integrasi API Worker, autentikasi, kalender, dan transaksi D1', { timeout: 120_000 }, async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), 'yrm-worker-test-'))
  const assets = join(scratch, 'assets')
  await mkdir(assets)
  await writeFile(join(assets, 'index.html'), '<!doctype html><html lang="id"><title>YRM Barber</title></html>')
  const { outputFiles } = await build({ entryPoints: ['src/server/index.ts'], bundle: true, write: false, format: 'esm', target: 'es2022' })
  const options = convertV4MiniflareOptions({
    name: 'yrm-worker-test', modules: true, script: outputFiles[0].text, compatibilityDate: '2026-03-01', port: 0,
    bindings: { APP_ENV: 'production' }, d1Databases: { DB: 'test-yrm' },
    resourcePersistencePath: scratch, logRequests: false,
    assets: { directory: assets, binding: 'ASSETS', run_worker_first: ['/api/*', '/admin/*'],
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: 'single-page-application' } },
  })
  let worker = new Miniflare(options)
  let origin = (await worker.ready).origin
  t.after(async () => { await worker.dispose(); await rm(scratch, { recursive: true }) })
  const database = await worker.getD1Database('DB')
  const files = (await readdir('migrations')).filter((file) => file.endsWith('.sql')).sort()
  for (const file of [...files.map((entry) => 'migrations/' + entry), 'scripts/seed.sql']) {
    const sql = await readFile(file, 'utf8')
    const commands = sql.replaceAll('--> statement-breakpoint', '').split(';').map((part) => part.trim()).filter(Boolean)
    await database.batch(commands.map((statement) => database.prepare(statement)))
  }
  await database.prepare('INSERT INTO admins (id, username, email, password_hash) VALUES (?, ?, ?, ?)')
    .bind('test-admin', 'uji', 'uji@example.test', await passwordHash(password)).run()
  for (const [id, shift] of [['capster-a', 'shift-a'], ['capster-b', 'shift-b'], ['capster-c', 'shift-c']]) {
    await database.prepare('INSERT INTO barber_schedules (id, barber_id, schedule_date, shift_id, is_day_off) VALUES (?, ?, ?, ?, ?)')
      .bind('schedule-' + id, id, day, shift, id === 'capster-c' ? 1 : 0).run()
  }
  let cookie, csrf, first, second
  let requestCount = 0
  async function call(path, { method = 'GET', body, secure = false, key = randomUUID(), headers = {} } = {}) {
    const outgoing = {
      'CF-Connecting-IP': '192.0.2.' + (++requestCount % 200 + 1),
      ...(method !== 'GET' && { Origin: origin }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(secure && { Cookie: cookie, 'X-CSRF-Token': csrf }),
      'Idempotency-Key': key, ...headers,
    }
    const response = await worker.dispatchFetch(origin + '/api' + path, { method, headers: outgoing,
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.match(response.headers.get('Content-Type') ?? '', /^application\/json/, (await response.clone().text()).slice(0, 700))
    return { status: response.status, headers: response.headers, ...(await response.json()) }
  }
  const admin = (path, method = 'GET', body, headers) => call('/admin' + path, { method, body, secure: true, headers })
  const post = (body, key) => call('/public/bookings', { method: 'POST', body, key })
  const slots = async (service = 'potong-rambut') => (await call('/public/availability?date=' + day + '&service_id=' + service)).data.slots
  await t.test('nested routes memuat SPA dan API yang tidak dikenal tetap JSON', async () => {
    for (const path of ['/booking/berhasil', '/admin/dashboard', '/admin/jadwal']) {
      const page = await worker.dispatchFetch(origin + path, { headers: { 'Sec-Fetch-Mode': 'navigate' } })
      assert.equal(page.status, 200, path + ' ' + (await page.clone().text()).slice(0, 700))
      assert.match(await page.text(), /<title>YRM Barber<\/title>/)
      if (path.startsWith('/admin')) assert.equal(page.headers.get('Cache-Control'), 'no-store')
    }
    const response = await call('/tidak-ada')
    assert.equal(response.status, 404)
    assert.equal(response.error.code, 'NOT_FOUND')
  })
  await t.test('validasi login, cookie aman, akses tanpa sesi, dan CSRF', async () => {
    assert.equal((await call('/admin/dashboard')).status, 401)
    assert.equal((await call('/auth/login', { method: 'POST', body: { identifier: 'uji', password: 'keliru' } })).status, 401)
    const result = await call('/auth/login', { method: 'POST', body: { identifier: 'UJi@example.test', password } })
    assert.equal(result.status, 200, JSON.stringify(result.error))
    const raw = result.headers.get('set-cookie')
    assert.match(raw, /^__Host-yrm_session=/)
    assert.match(raw, /HttpOnly/i)
    assert.match(raw, /SameSite=Strict/i)
    assert.match(raw, /Secure/i)
    cookie = raw.split(';')[0]
    csrf = result.data.csrf
    assert.equal((await call('/auth/me', { secure: true })).data.username, 'uji')
    assert.equal((await admin('/settings', 'PATCH', {}, { 'X-CSRF-Token': 'keliru' })).status, 403)
    assert.equal((await admin('/settings', 'PATCH', {}, { Origin: 'https://lain.example' })).status, 403)
  })
  await t.test('shift, libur, waktu lampau dan akhir durasi diberlakukan', async () => {
    const offered = await slots()
    assert.equal(offered.find((slot) => slot.start === 480).barbers.find((b) => b.id === 'capster-b').status, 'outside')
    assert.equal(offered.find((slot) => slot.start === 600).barbers.find((b) => b.id === 'capster-c').status, 'off')
    assert.equal((await post({ ...booking(), date: addDays(today(), -1) })).status, 409)
    assert.equal((await post(booking('capster-a', 960))).status, 409)
    assert.equal((await post(booking('capster-c'))).status, 409)
  })
  await t.test('double-booking konkuren ditolak, dua capster paralel diizinkan, retry idempoten', async () => {
    const results = await Promise.all([post(booking()), post(booking())])
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409], JSON.stringify(results.map((result) => result.error)))
    first = results.find((result) => result.status === 201).data
    const key = randomUUID()
    const requests = await Promise.all([post(booking('capster-b'), key), post(booking('capster-b'), key)])
    assert.deepEqual(requests.map((result) => result.status).sort(), [200, 201])
    second = requests[0].data
    assert.equal(second.booking_code, requests[1].data.booking_code)
    assert.equal((await post({ ...booking('capster-b'), customer_name: 'Nama lain' }, key)).status, 409)
    assert.equal((await slots()).find((slot) => slot.start === 600).state, 'full')
    assert.equal(await database.prepare('SELECT COUNT(*) FROM booking_slots WHERE booking_date = ?').bind(day).first('COUNT(*)'), 12)
    assert.equal('customer_phone' in first, false)
    assert.match(first.booking_code, /^YRM-[0-9A-F]{16}$/)
  })
  await t.test('reschedule gagal tetap memegang slot; pembatalan membuka slot', async () => {
    const change = { date: day, start: 600, barber_id: 'capster-b' }
    assert.equal((await admin('/bookings/' + first.id, 'PATCH', change)).status, 409)
    assert.equal((await admin('/bookings/' + first.id)).data.barber_id, 'capster-a')
    assert.equal((await admin('/bookings/' + second.id + '/cancel', 'POST')).data.status, 'cancelled')
    const moved = await admin('/bookings/' + first.id, 'PATCH', change)
    assert.equal(moved.status, 200)
    assert.equal(moved.data.barber_id, 'capster-b')
    assert.equal((await slots()).find((slot) => slot.start === 600).barbers.find((b) => b.id === 'capster-a').status, 'available')
  })
  await t.test('perubahan harga dan durasi menjaga snapshot; slot di ujung shift ditolak', async () => {
    const service = { name: 'Potongan terbaru', description: '', price: 50000, duration_minutes: 45, sort_order: 1, is_active: true }
    assert.equal((await admin('/services/potong-rambut', 'PATCH', service)).status, 200)
    const previous = (await admin('/bookings/' + first.id)).data
    assert.equal(previous.price_snapshot, 25000)
    assert.equal(previous.duration_snapshot, 30)
    assert.equal(previous.service_name_snapshot, 'Potong Rambut')
    assert.equal((await post({ ...booking('capster-a', 630), quote: { price: 25000, duration_minutes: 30 } })).error.code, 'QUOTE_CHANGED')
    assert.equal((await slots()).find((slot) => slot.start === 930).barbers.find((b) => b.id === 'capster-a').status, 'outside')
    assert.equal((await post(booking('capster-a', 630))).data.price_snapshot, 50000)
  })
  await t.test('libur, nonaktif capster, dan perubahan shift yang berbenturan ditolak', async () => {
    const off = { barber_id: 'capster-b', schedule_date: day, shift_id: null, start_time: null, end_time: null, is_day_off: true }
    const result = await admin('/schedules', 'POST', off)
    assert.equal(result.status, 409)
    assert.ok(result.error.details.bookings.includes(first.booking_code))
    assert.equal((await admin('/barbers/capster-b', 'DELETE')).status, 409)
    assert.equal((await admin('/shifts/shift-b', 'PATCH', { name: 'Shift B', start_time: 660, end_time: 1080, is_active: true })).status, 409)
    assert.equal((await admin('/schedules', 'POST', { ...off, barber_id: 'capster-c' })).status, 201)
  })
  await t.test('perubahan admin dan booking bersamaan menjaga jadwal konsisten', async () => {
    const [booked, closed] = await Promise.all([post(booking('capster-b', 720)), admin('/schedules', 'POST',
      { barber_id: 'capster-b', schedule_date: day, shift_id: null, start_time: 540, end_time: 700, is_day_off: false })])
    assert.equal([booked.status, closed.status].filter((status) => status === 201).length, 1)
    assert.equal([booked.status, closed.status].filter((status) => status === 409).length, 1)
  })
  await t.test('admin CRUD, walk-in, laporan, pagination, dan pratinjau jadwal', async () => {
    const shift = await admin('/shifts', 'POST', { name: 'Tambahan', start_time: 600, end_time: 720, is_active: true })
    const barber = await admin('/barbers', 'POST', { name: 'Capster Baru', description: '', photo_url: '', sort_order: 20, is_active: true })
    assert.equal(shift.status, 201)
    assert.equal(barber.status, 201)
    assert.equal((await admin('/services', 'POST', { name: 'Layanan Baru', description: '', price: 0, duration_minutes: 35, sort_order: 4, is_active: true })).status, 201)
    const current = today()
    assert.equal((await admin('/schedules', 'POST', { barber_id: barber.data.id, shift_id: shift.data.id,
      schedule_date: current, start_time: null, end_time: null, is_day_off: false })).status, 201)
    const manual = await admin('/bookings', 'POST', { ...booking(barber.data.id, 605), date: current })
    assert.equal(manual.status, 201, JSON.stringify(manual.error))
    const report = await admin('/dashboard')
    assert.equal(report.data.total, 1)
    assert.equal(report.data.estimate, 50000)
    assert.equal(report.data.week.length, 7)
    assert.equal((await admin('/bookings?q=' + encodeURIComponent(first.booking_code))).data.total, 1)
    assert.equal((await admin('/bookings?page=2')).data.page, 2)
    const week = monday(addDays(day, 21))
    for (const action of ['generate', 'rotate', 'copy']) {
      const draft = await admin('/schedules/' + action, 'POST', { week, preview: true })
      assert.equal(draft.status, 200)
      assert.equal(draft.data.count, 28)
      const applied = await admin('/schedules/' + action, 'POST', { week, preview: false, expected_revision: draft.data.revision })
      assert.equal(applied.status, 200, JSON.stringify(applied.error))
    }
    assert.equal((await admin('/schedules?week=' + week)).data.cells.length, 28)
  })
  await t.test('tutup online, batas laju dan ukuran kiriman', async () => {
    const settings = (await admin('/settings')).data
    assert.equal((await admin('/settings', 'PATCH', { ...settings, online_enabled: false })).status, 200)
    assert.equal((await post(booking('capster-a', 870))).status, 409)
    assert.equal((await admin('/settings', 'PATCH', { ...settings, online_enabled: true, phone_required: true })).status, 200)
    assert.equal((await post(booking('capster-a', 870))).error.code, 'PHONE_REQUIRED')
    assert.equal((await call('/public/bookings', { method: 'POST', body: { padding: 'x'.repeat(50_000) } })).status, 413)
    const headers = { 'CF-Connecting-IP': '198.51.100.80' }
    let attempt
    for (let i = 0; i < 16; i++) attempt = await call('/public/bookings', { method: 'POST', body: {}, headers })
    assert.equal(attempt.status, 429)
    assert.equal(attempt.headers.get('cache-control'), 'no-store')
  })
  await t.test('logout membatalkan sesi dan data bertahan setelah Workerd dimulai ulang', async () => {
    assert.equal((await call('/auth/logout', { method: 'POST', secure: true })).status, 200)
    assert.equal((await call('/auth/me', { secure: true })).status, 401)
    await worker.dispose()
    worker = new Miniflare(options)
    origin = (await worker.ready).origin
    assert.equal((await call('/public/services')).data.find((row) => row.id === 'potong-rambut').price, 50000)
    const restarted = await worker.getD1Database('DB')
    assert.equal(await restarted.prepare('SELECT COUNT(*) FROM bookings WHERE booking_code = ?').bind(first.booking_code).first('COUNT(*)'), 1)
    assert.ok(await restarted.prepare('SELECT COUNT(*) FROM audit_logs').first('COUNT(*)') > 8)
  })
})

