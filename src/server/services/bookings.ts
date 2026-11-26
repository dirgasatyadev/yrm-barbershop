import { startStamp, today, UNIT } from '../../shared/time.ts'
import type { Availability, Booking, BookingInput, BookingReceipt, BookingStatus } from '../../shared/types.ts'
import { audit, readState, revisionGuard } from '../db/state.ts'
import { ApiError, conflict, dbRace, notFound } from '../errors.ts'
import { availability, customerTime, fits, units, workFor } from './calendar.ts'
import { digest, randomHex } from './crypto.ts'

export async function busyUnits(db: D1Database, date: string, exclude = '') {
  const rows = await db.prepare('SELECT barber_id, slot_start FROM booking_slots WHERE booking_date = ? AND booking_id != ?')
    .bind(date, exclude).all<{ barber_id: string; slot_start: number }>()
  return new Set(rows.results.map((row) => row.barber_id + ':' + row.slot_start))
}
export async function dayAvailability(db: D1Database, date: string, serviceId: string, barberId?: string, admin = false, bookingId?: string): Promise<Availability> {
  const [state, busy, existing] = await Promise.all([readState(db, date), busyUnits(db, date, bookingId),
    admin && bookingId ? getBooking(db, bookingId) : null])
  const service = state.services.find((item) => item.id === serviceId && item.is_active)
  if (!service && !existing) throw notFound('Layanan tidak tersedia.')
  if (existing && existing.service_id !== serviceId) throw new ApiError(400, 'SERVICE', 'Layanan reservasi tidak cocok.')
  return availability(state, date, existing?.duration_snapshot ?? service!.duration_minutes, busy, barberId, admin)
}
function lock(db: D1Database, booking: Booking) {
  return db.prepare(`INSERT INTO booking_slots (booking_id, barber_id, booking_date, slot_start)
    SELECT id, barber_id, booking_date, slot_start FROM bookings CROSS JOIN
    (WITH RECURSIVE slots(slot_start) AS (SELECT ? UNION ALL SELECT slot_start + 5 FROM slots WHERE slot_start + 5 < ?) SELECT * FROM slots)
    WHERE id = ?`).bind(booking.start_time, booking.end_time, booking.id)
}
function receipt(booking: Booking, confirmation: string): BookingReceipt {
  const { id, booking_code, customer_name, service_name_snapshot, barber_name_snapshot,
    price_snapshot, duration_snapshot, booking_date, start_time, end_time, status } = booking
  return { id, booking_code, customer_name, service_name_snapshot, barber_name_snapshot,
    price_snapshot, duration_snapshot, booking_date, start_time, end_time, status, confirmation }
}
async function replay(db: D1Database, key: string, fingerprint: string) {
  const existing = await db.prepare('SELECT fingerprint, response FROM booking_idempotency WHERE key = ?')
    .bind(key).first<{ fingerprint: string; response: string }>()
  if (!existing) return null
  if (existing.fingerprint !== fingerprint) throw conflict('Kunci permintaan sudah digunakan untuk data yang berbeda.')
  return JSON.parse(existing.response) as BookingReceipt
}
export async function createBooking(db: D1Database, input: BookingInput, requestKey: string, actor?: string) {
  const key = await digest((actor ?? 'public') + ':' + requestKey)
  const fingerprint = await digest(JSON.stringify(input))
  for (let attempt = 0; attempt < 5; attempt++) {
    const previous = await replay(db, key, fingerprint)
    if (previous) return { data: previous, replayed: true }
    const state = await readState(db, input.date)
    const busy = await busyUnits(db, input.date)
    const service = state.services.find((item) => item.id === input.service_id && item.is_active)
    if (!service) throw notFound('Layanan tidak tersedia.')
    if (input.quote && (input.quote.price !== service.price || input.quote.duration_minutes !== service.duration_minutes)) {
      throw new ApiError(409, 'QUOTE_CHANGED', 'Harga atau durasi layanan berubah. Tinjau kembali reservasi.')
    }
    const now = new Date()
    if (!actor && !state.settings.online_enabled) throw new ApiError(409, 'CLOSED', 'Reservasi online sedang ditutup.')
    if (!actor && state.settings.phone_required && !input.customer_phone) {
      throw new ApiError(400, 'PHONE_REQUIRED', 'Nomor WhatsApp wajib diisi.')
    }
    const valid = actor ? input.date >= today(now) : customerTime(state.settings, input.date, input.start, now)
    if (!valid) throw conflict('Waktu reservasi sudah lewat atau tidak dapat dipilih.')
    const end = input.start + service.duration_minutes
    const candidates = state.barbers.filter((person) => (!input.barber_id || person.id === input.barber_id) &&
      fits(state.settings, workFor(state, person, input.date), input.start, end) &&
      units(input.start, end).every((slot) => !busy.has(person.id + ':' + slot)))
    const barber = candidates[0]
    if (!barber) {
      const previous = await replay(db, key, fingerprint)
      if (previous) return { data: previous, replayed: true }
      throw conflict('Capster tidak tersedia pada jam tersebut. Pilih jam atau capster lain.')
    }
    const stamp = now.toISOString()
    const booking: Booking = {
      id: crypto.randomUUID(), booking_code: 'YRM-' + randomHex(8).toUpperCase(), customer_name: input.customer_name,
      customer_phone: input.customer_phone, customer_notes: input.customer_notes, service_id: service.id,
      barber_id: barber.id, service_name_snapshot: service.name, barber_name_snapshot: barber.name, price_snapshot: service.price,
      duration_snapshot: service.duration_minutes, booking_date: input.date, start_time: input.start, end_time: end,
      status: 'confirmed', created_at: stamp, updated_at: stamp,
    }
    const data = receipt(booking, state.settings.confirmation)
    const insert = db.prepare(`INSERT INTO bookings (id, booking_code, customer_name, customer_phone, customer_notes,
      service_id, barber_id, service_name_snapshot, barber_name_snapshot, price_snapshot, duration_snapshot,
      booking_date, start_time, end_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(booking.id, booking.booking_code, booking.customer_name, booking.customer_phone, booking.customer_notes,
        booking.service_id, booking.barber_id, booking.service_name_snapshot, booking.barber_name_snapshot, booking.price_snapshot,
        booking.duration_snapshot, booking.booking_date, booking.start_time, booking.end_time, booking.status, stamp, stamp)
    try {
      await db.batch([revisionGuard(db, state.revision), insert, lock(db, booking),
        db.prepare('INSERT INTO booking_idempotency (key, fingerprint, response, booking_id) VALUES (?, ?, ?, ?)')
          .bind(key, fingerprint, JSON.stringify(data), booking.id),
        ...(actor ? [audit(db, actor, 'create', 'booking', booking.id)] : []),
      ])
      return { data, replayed: false }
    } catch (error) {
      if (!dbRace(error)) throw error
    }
  }
  const previous = await replay(db, key, fingerprint)
  if (previous) return { data: previous, replayed: true }
  throw conflict('Slot sedang berubah. Segarkan ketersediaan dan coba lagi.')
}
export async function getBooking(db: D1Database, id: string) {
  const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first<Booking>()
  if (!booking) throw notFound('Reservasi tidak ditemukan.')
  return booking
}
export async function updateBooking(db: D1Database, id: string, actor: string, update: { status: BookingStatus } | { date: string; start: number; barber_id: string }) {
  const date = 'status' in update ? today() : update.date
  const state = await readState(db, date)
  const booking = await getBooking(db, id)
  const stamp = new Date().toISOString()
  if ('status' in update && booking.status === update.status) return booking
  if (booking.status !== 'confirmed') throw conflict('Hanya reservasi terkonfirmasi yang dapat diubah.')
  const remove = db.prepare('DELETE FROM booking_slots WHERE booking_id = ?').bind(id)
  let writes: D1PreparedStatement[]
  let next: Booking
  if ('status' in update) {
    if ((update.status === 'completed' || update.status === 'no_show') && startStamp(booking.booking_date, booking.start_time) > Date.now()) {
      throw conflict('Reservasi ini belum dimulai.')
    }
    next = { ...booking, status: update.status, updated_at: stamp }
    writes = [db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').bind(next.status, stamp, id)]
    if (next.status === 'cancelled') writes.push(remove)
  } else {
    const barber = state.barbers.find((item) => item.id === update.barber_id)
    const end = update.start + booking.duration_snapshot
    if (!barber || update.start % UNIT !== 0 || startStamp(date, update.start) < Date.now() ||
      !fits(state.settings, workFor(state, barber, date), update.start, end)) {
      throw conflict('Jadwal baru di luar jam kerja atau sudah berlalu.')
    }
    const busy = await busyUnits(db, date, id)
    if (units(update.start, end).some((slot) => busy.has(barber.id + ':' + slot))) throw conflict('Capster sudah dibooking pada jadwal baru.')
    next = { ...booking, barber_id: barber.id, barber_name_snapshot: barber.name, booking_date: date,
      start_time: update.start, end_time: end, updated_at: stamp }
    writes = [
      remove,
      db.prepare('UPDATE bookings SET barber_id = ?, barber_name_snapshot = ?, booking_date = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?')
        .bind(barber.id, barber.name, date, update.start, end, stamp, id),
      lock(db, next),
    ]
  }
  try {
    await db.batch([revisionGuard(db, state.revision), ...writes,
      audit(db, actor, 'status' in update ? update.status : 'reschedule', 'booking', id,
        { before: { date: booking.booking_date, start: booking.start_time, status: booking.status, barber_id: booking.barber_id }, after: update }),
    ])
    return next
  } catch (error) {
    if (dbRace(error)) throw conflict('Jadwal berubah atau slot sudah terisi. Muat ulang ketersediaan.')
    throw error
  }
}
