import type { Booking, Dashboard } from '../../shared/types.ts'
import { addDays, today } from '../../shared/time.ts'
import { readState } from '../db/state.ts'
import { workFor } from './calendar.ts'
import type { z } from 'zod'
import type { bookingFilter } from '../../shared/schemas.ts'

export async function listBookings(db: D1Database, filters: z.infer<typeof bookingFilter>) {
  const conditions: string[] = []
  const params: string[] = []
  if (filters.q) {
    conditions.push("(customer_name LIKE ? ESCAPE '!' OR booking_code LIKE ? ESCAPE '!')")
    const search = '%' + filters.q.replace(/[!%_]/g, (char) => '!' + char) + '%'
    params.push(search, search)
  }
  for (const [column, value] of Object.entries({ booking_date: filters.date, barber_id: filters.barber_id, service_id: filters.service_id, status: filters.status })) {
    if (value) {
      conditions.push(column + ' = ?')
      params.push(value)
    }
  }
  const from = ' FROM bookings' + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '')
  const pageSize = 15
  const [count, rows] = await db.batch([
    db.prepare('SELECT COUNT(*) AS total' + from).bind(...params),
    db.prepare('SELECT *' + from + ' ORDER BY booking_date DESC, start_time DESC, id DESC LIMIT ? OFFSET ?')
      .bind(...params, pageSize, (filters.page - 1) * pageSize),
  ])
  return { total: (count.results[0] as { total: number }).total, items: rows.results as Booking[], page: filters.page, pageSize }
}
export async function dashboard(db: D1Database): Promise<Dashboard> {
  const date = today()
  const minute = Math.floor((Date.now() - Date.parse(date + 'T00:00:00+07:00')) / 60_000)
  const first = addDays(date, -6)
  const [state, [summary, lastWeek, popular, recent]] = await Promise.all([readState(db, date), db.batch([
    db.prepare(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
      COALESCE(SUM(price_snapshot) FILTER (WHERE status IN ('confirmed','completed')),0) AS estimate,
      COALESCE(SUM(price_snapshot) FILTER (WHERE status = 'completed'),0) AS completed_value,
      (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND (booking_date > ? OR (booking_date = ? AND start_time >= ?))) AS upcoming
      FROM bookings WHERE booking_date = ?`).bind(date, date, minute, date),
    db.prepare('SELECT booking_date AS date, COUNT(*) AS total FROM bookings WHERE booking_date BETWEEN ? AND ? GROUP BY booking_date').bind(first, date),
    db.prepare(`SELECT MIN(service_name_snapshot) AS name, COUNT(*) AS total FROM bookings
      WHERE status IN ('confirmed', 'completed') AND booking_date BETWEEN ? AND ? GROUP BY service_id ORDER BY total DESC, name LIMIT 5`).bind(addDays(date, -29), date),
    db.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 6'),
  ])])
  const schedule = state.barbers.filter((barber) => barber.is_active).map((barber) => ({ ...barber, work: workFor(state, barber, date) }))
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(first, i)
    return { date: day, total: (lastWeek.results as Dashboard['week']).find((row) => row.date === day)?.total ?? 0 }
  })
  return { ...(summary.results[0] as Pick<Dashboard, 'total' | 'completed' | 'cancelled' | 'estimate' | 'completed_value' | 'upcoming'>),
    date, week, active: schedule.filter((b) => !b.work.is_day_off).length, schedule, popular: popular.results as Dashboard['popular'], recent: recent.results as Booking[] }
}
