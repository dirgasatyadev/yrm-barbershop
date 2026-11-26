import { addDays, monday, startStamp, today, weekday } from '../../shared/time.ts'
import type { Barber, Booking, Rotation, Schedule, Service, Settings, Shift, WeekCell } from '../../shared/types.ts'
import { audit, readState, revisionGuard, saveSetting } from '../db/state.ts'
import type { State } from '../db/state.ts'
import { ApiError, conflict, dbRace, notFound } from '../errors.ts'
import { conflictsFor, rotationEntry, workFor } from './calendar.ts'

const updated = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
const replaceItem = <T extends { id: string }>(rows: T[], item: T) => [...rows.filter((r) => r.id !== item.id), item]
const range = (week: string) => Array.from({ length: 7 }, (_, i) => addDays(week, i))
type Catalog = Service | Barber | Shift

type CatalogKey = 'services' | 'barbers' | 'shifts'
const fields = {
  services: ['name', 'description', 'price', 'duration_minutes', 'sort_order', 'is_active'],
  barbers: ['name', 'photo_url', 'description', 'sort_order', 'is_active'],
  shifts: ['name', 'start_time', 'end_time', 'is_active'],
} as const

export function validateShift(shift: Pick<Shift, 'start_time' | 'end_time'>, settings: Settings) {
  if (shift.start_time < settings.opens || shift.end_time > settings.closes) {
    throw new ApiError(400, 'WORK_HOURS', 'Jam shift harus berada dalam jam operasional.')
  }
}
async function upcoming(db: D1Database, from: string, through = '2099-12-31') {
  const now = Date.now()
  const rows = await db.prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND booking_date BETWEEN ? AND ? ORDER BY booking_date, start_time")
    .bind(from, through).all<Booking>()
  return rows.results.filter((booking) => startStamp(booking.booking_date, booking.end_time) > now)
}
const assertSafe = (state: State, bookings: Booking[]) => {
  const conflicts = conflictsFor(state, bookings)
  if (conflicts.length) throw conflict('Perubahan bentrok dengan reservasi aktif. Ubah jadwal atau batalkan reservasi terkait terlebih dahulu.',
    { bookings: conflicts.map((booking) => booking.booking_code) })
}

async function mutate(db: D1Database, state: State, actor: string, action: string, entity: string, id: string,
  writes: D1PreparedStatement[], metadata: object = {}) {
  try {
    await db.batch([revisionGuard(db, state.revision), ...writes, audit(db, actor, action, entity, id, metadata)])
  } catch (error) {
    if (dbRace(error)) throw conflict()
    throw error
  }
}

export async function saveCatalog(db: D1Database, actor: string, key: CatalogKey, input: Omit<Service, 'id'> | Omit<Barber, 'id'> | Omit<Shift, 'id'> | null, id?: string) {
  const from = today()
  const state = await readState(db, from, '2099-12-31')
  const old = id ? state[key].find((row) => row.id === id) : undefined
  if (id && !old) throw notFound()
  const row = { ...old, ...input, id: id ?? crypto.randomUUID(), ...(!input && { is_active: false }) } as Catalog
  if (key === 'shifts' && row.is_active) validateShift(row as Shift, state.settings)
  if (key === 'barbers' || key === 'shifts') {
    const projected = key === 'shifts' ? { ...state, shifts: replaceItem(state.shifts, row as Shift) } :
      { ...state, barbers: replaceItem(state.barbers, row as Barber) }
    assertSafe(projected, await upcoming(db, from))
  }
  const keys = fields[key]
  const values = keys.map((field) => {
    const value = (row as unknown as Record<string, string | number | boolean>)[field]
    return typeof value === 'boolean' ? Number(value) : value
  })
  const write = old ? db.prepare('UPDATE ' + key + ' SET ' + keys.map((field) => field + ' = ?').join(', ') + ', updated_at = ' + updated + ' WHERE id = ?')
    .bind(...values, row.id) :
    db.prepare('INSERT INTO ' + key + ' (id, ' + keys.join(', ') + ') VALUES (' + Array(keys.length + 1).fill('?').join(', ') + ')').bind(row.id, ...values)
  await mutate(db, state, actor, !input ? 'deactivate' : old ? 'update' : 'create', key, row.id, [write])
  return row
}

export async function saveBusiness(db: D1Database, actor: string, settings: Settings) {
  const from = today()
  const state = await readState(db, from, '2099-12-31')
  assertSafe({ ...state, settings }, await upcoming(db, from))
  await mutate(db, state, actor, 'update', 'settings', 'business', [saveSetting(db, 'business', settings)])
  return settings
}
export async function saveRotation(db: D1Database, actor: string, rotation: Rotation) {
  const from = today()
  const state = await readState(db, from, '2099-12-31')
  for (const rule of rotation.rules) {
    if (!state.barbers.some((b) => b.id === rule.barber_id) || !state.shifts.some((s) => s.id === rule.shift_id)) {
      throw new ApiError(400, 'ROTATION', 'Capster atau shift pada pola rotasi tidak ditemukan.')
    }
  }
  assertSafe({ ...state, rotation }, await upcoming(db, from))
  await mutate(db, state, actor, 'update', 'settings', 'rotation', [saveSetting(db, 'rotation', rotation)])
  return rotation
}

export function weekCells(state: State, week: string, bookings: Booking[]): WeekCell[] {
  const conflicts = conflictsFor(state, bookings)
  return state.barbers.flatMap((barber) => range(week).map((date) => ({
    barber_id: barber.id, date, work: workFor(state, barber, date),
    schedule: state.schedules.find((s) => s.barber_id === barber.id && s.schedule_date === date) ?? null,
    conflicts: conflicts.filter((b) => b.barber_id === barber.id && b.booking_date === date).map((b) => b.booking_code),
  })))
}
export async function getWeek(db: D1Database, date: string) {
  const week = monday(date)
  const through = addDays(week, 6)
  const state = await readState(db, week, through)
  return { week, barbers: state.barbers, cells: weekCells(state, week, await upcoming(db, week, through)), rotation: state.rotation }
}
export async function saveSchedule(db: D1Database, actor: string, data: Omit<Schedule, 'id'>, id?: string) {
  const state = await readState(db, data.schedule_date)
  if (data.schedule_date < today()) throw new ApiError(400, 'SCHEDULE_DATE', 'Jadwal yang sudah berlalu tidak dapat diubah.')
  if (!state.barbers.some((b) => b.id === data.barber_id)) throw notFound('Capster tidak ditemukan.')
  const existing = state.schedules.find((s) => s.barber_id === data.barber_id && s.schedule_date === data.schedule_date)
  if (id && existing?.id !== id) throw notFound('Jadwal tidak ditemukan untuk tanggal dan capster ini.')
  const shift = state.shifts.find((s) => s.id === data.shift_id && s.is_active)
  if (data.shift_id && !shift) throw notFound('Shift tidak tersedia.')
  if (shift) validateShift(shift, state.settings)
  if (data.start_time !== null && data.end_time !== null) validateShift({ start_time: data.start_time, end_time: data.end_time }, state.settings)
  const row = { ...data, id: existing?.id ?? crypto.randomUUID() }
  assertSafe({ ...state, schedules: replaceItem(state.schedules, row) }, await upcoming(db, row.schedule_date, row.schedule_date))
  await mutate(db, state, actor, 'save', 'schedule', row.id, [writeSchedule(db, row)], { date: row.schedule_date, barber_id: row.barber_id })
  return row
}
function writeSchedule(db: D1Database, row: Schedule) {
  return db.prepare(`INSERT INTO barber_schedules (id, barber_id, schedule_date, shift_id, start_time, end_time, is_day_off, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (barber_id, schedule_date) DO UPDATE SET
      shift_id = excluded.shift_id, start_time = excluded.start_time, end_time = excluded.end_time,
      is_day_off = excluded.is_day_off, notes = excluded.notes, updated_at = ${updated}`)
    .bind(row.id, row.barber_id, row.schedule_date, row.shift_id, row.start_time, row.end_time, Number(row.is_day_off), row.notes)
}
export async function runWeek(db: D1Database, actor: string, date: string, action: 'generate' | 'rotate' | 'copy', preview: boolean, expectedRevision?: number) {
  const week = monday(date)
  const prior = addDays(week, -7)
  const through = addDays(week, 6)
  if (through < today()) throw new ApiError(400, 'SCHEDULE_DATE', 'Minggu ini telah berlalu.')
  const state = await readState(db, prior, through)
  if (!preview && expectedRevision !== state.revision) throw conflict('Jadwal atau reservasi berubah. Perbarui pratinjau sebelum menerapkan.')
  const bookings = await upcoming(db, week, through)
  const rows = state.barbers.filter((b) => b.is_active).flatMap((barber) => range(week).filter((date) => date >= today()).map((date): Schedule => {
    const existing = state.schedules.find((s) => s.barber_id === barber.id && s.schedule_date === date)
    const row = { id: existing?.id ?? crypto.randomUUID(), barber_id: barber.id, schedule_date: date,
      start_time: null, end_time: null, shift_id: null, is_day_off: true, notes: '' }
    if (action === 'copy') {
      const from = addDays(date, -7)
      const previous = state.schedules.find((s) => s.barber_id === barber.id && s.schedule_date === from)
      if (previous) return { ...previous, id: row.id, schedule_date: date }
      const work = workFor(state, barber, from)
      if (work.is_day_off) return row
      const rule = rotationEntry(state, barber.id, from)
      return { ...row, shift_id: rule?.shift_id ?? null, is_day_off: false, ...(!rule && { start_time: work.start, end_time: work.end }) }
    }
    const rule = rotationEntry(state, barber.id, date, action === 'rotate' ? 1 : 0)
    const shift = state.shifts.find((s) => s.id === rule?.shift_id && s.is_active)
    return !rule || !shift || rule.off_weekday === weekday(date) ? row : { ...row, shift_id: shift.id, is_day_off: false }
  }))
  const changes = new Map(rows.map((row) => [row.id, row]))
  const projected = { ...state, schedules: [...state.schedules.filter((row) => !changes.has(row.id)), ...rows] }
  if (!preview) {
    assertSafe(projected, bookings)
    await mutate(db, state, actor, action, 'schedule', week, rows.map((row) => writeSchedule(db, row)), { count: rows.length })
  }
  return { week, cells: weekCells(projected, week, bookings), count: rows.length, revision: state.revision }
}
