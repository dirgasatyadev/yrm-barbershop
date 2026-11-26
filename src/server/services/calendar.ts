import { addDays, dayNumber, monday, startStamp, today, UNIT, weekday } from '../../shared/time.ts'
import type { Availability, Barber, Booking, CapsterStatus, Schedule, TimeSlot, Work } from '../../shared/types.ts'
import type { State } from '../db/state.ts'

type CalendarState = Pick<State, 'settings' | 'rotation' | 'shifts'> & { schedules: Schedule[] }
const off: Work = { is_day_off: true, label: 'Belum terjadwal' }

export function rotationWeek(date: string, anchor: string, length: number) {
  const week = (dayNumber(monday(date)) - dayNumber(monday(anchor))) / 7
  return ((week % length) + length) % length
}
export function rotationEntry(state: CalendarState, barber: string, date: string, offset = 0) {
  const week = (rotationWeek(date, state.rotation.anchor, state.rotation.length) + offset) % state.rotation.length
  return state.rotation.rules.find((rule) => rule.barber_id === barber && rule.week === week)
}
export function workFor(state: CalendarState, barber: Barber, date: string): Work {
  if (!barber.is_active) return { is_day_off: true, label: 'Tidak aktif' }
  const row = state.schedules.find((s) => s.barber_id === barber.id && s.schedule_date === date)
  if (row?.is_day_off) return { is_day_off: true, label: 'Libur' }
  if (row?.start_time !== null && row?.start_time !== undefined && row.end_time !== null) {
    return { is_day_off: false, start: row.start_time, end: row.end_time, label: 'Jam khusus' }
  }
  const rule = row ? null : rotationEntry(state, barber.id, date)
  if (rule?.off_weekday === weekday(date)) return { is_day_off: true, label: 'Libur' }
  const shift = state.shifts.find((shift) => shift.id === (row?.shift_id ?? rule?.shift_id) && shift.is_active)
  return shift ? { is_day_off: false, start: shift.start_time, end: shift.end_time, label: shift.name } : off
}
export function fits(settings: State['settings'], work: Work, start: number, end: number) {
  return !work.is_day_off && start >= Math.max(settings.opens, work.start) &&
    end <= Math.min(settings.closes, work.end) && end > start
}
export function units(start: number, end: number) {
  return Array.from({ length: Math.ceil((end - start) / UNIT) }, (_, i) => start + i * UNIT)
}
export function customerTime(settings: State['settings'], date: string, start: number, now: Date) {
  const first = today(now)
  return settings.online_enabled && date >= first && date <= addDays(first, settings.max_days) &&
    start >= settings.opens && (start - settings.opens) % settings.interval === 0 &&
    startStamp(date, start) >= now.getTime() + settings.lead_minutes * 60_000
}
export function availability(state: State, date: string, duration: number, taken: Set<string>, barberId: string | undefined, manual: boolean, now = new Date()): Availability {
  const barbers = state.barbers.filter((barber) => barber.is_active).map((barber) => ({ ...barber, work: workFor(state, barber, date) }))
  const slots: TimeSlot[] = []
  for (let start = state.settings.opens; start < state.settings.closes; start += manual ? UNIT : state.settings.interval) {
    const end = start + duration
    const valid = manual ? date >= today(now) : customerTime(state.settings, date, start, now)
    const options = barbers.map((barber) => {
      let status: CapsterStatus = 'outside'
      if (barber.work.is_day_off) status = 'off'
      else if (valid && fits(state.settings, barber.work, start, end)) {
        status = units(start, end).some((slot) => taken.has(barber.id + ':' + slot)) ? 'booked' : 'available'
      }
      return { id: barber.id, status }
    })
    const eligible = barberId ? options.filter((option) => option.id === barberId) : options
    const status = eligible.some((option) => option.status === 'available') ? 'available' :
      eligible.some((option) => option.status === 'booked') ? 'full' : 'unavailable'
    slots.push({ start, end, state: status, barbers: options })
  }
  return { date, slots, barbers }
}
export function conflictsFor(state: State, bookings: Booking[]) {
  return bookings.filter((booking) => {
    const barber = state.barbers.find((person) => person.id === booking.barber_id)
    return !barber || !fits(state.settings, workFor(state, barber, booking.booking_date), booking.start_time, booking.end_time)
  })
}
