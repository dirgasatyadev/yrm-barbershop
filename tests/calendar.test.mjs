import assert from 'node:assert/strict'
import test from 'node:test'
import { defaults } from '../src/shared/schemas.ts'
import { addDays, monday, today } from '../src/shared/time.ts'
import { availability, customerTime, rotationWeek, units, workFor } from '../src/server/services/calendar.ts'

const barber = { id: 'a', name: 'Capster A', is_active: true }
const shift = { id: 'a-shift', name: 'Shift A', start_time: 480, end_time: 960, is_active: true }
const date = '2026-11-24'
const now = new Date('2026-11-23T02:00:00Z')
function state() {
  return { settings: defaults, barbers: [barber], shifts: [shift], schedules: [],
    rotation: { anchor: '2026-11-23', length: 3, rules: [{ barber_id: 'a', week: 0, shift_id: shift.id, off_weekday: 2 }] } }
}
test('tanggal operasional menggunakan WIB, termasuk sekitar tengah malam', () => {
  assert.equal(today(new Date('2026-11-23T16:59:59Z')), '2026-11-23')
  assert.equal(today(new Date('2026-11-23T17:00:00Z')), '2026-11-24')
  assert.equal(monday(date), '2026-11-23')
  assert.equal(rotationWeek('2026-11-16', '2026-11-23', 3), 2)
  assert.equal(rotationWeek('2026-12-07', '2026-11-23', 3), 2)
})
test('slot lima menit mendukung durasi nonstandar dan ujung rentang terbuka', () => {
  assert.deepEqual(units(600, 625), [600, 605, 610, 615, 620])
  assert.equal(units(600, 630).includes(630), false)
})
test('hari libur, shift, durasi penuh, dan unit sibuk menentukan ketersediaan', () => {
  const config = state()
  const response = availability(config, date, 45, new Set(['a:515']), undefined, false, now)
  assert.equal(response.slots.find((slot) => slot.start === 480).state, 'full')
  assert.equal(response.slots.find((slot) => slot.start === 510).state, 'full')
  assert.equal(response.slots.find((slot) => slot.start === 540).state, 'available')
  assert.equal(response.slots.find((slot) => slot.start === 930).state, 'unavailable')
  assert.equal(workFor(config, barber, addDays(date, 1)).label, 'Libur')
  config.schedules.push({ barber_id: 'a', schedule_date: date, is_day_off: true })
  assert.equal(workFor(config, barber, date).label, 'Libur')
})
test('waktu lampau, waktu tunggu, interval, hari maksimum, dan penutupan online', () => {
  assert.equal(customerTime(defaults, '2026-11-23', 510, now), false)
  assert.equal(customerTime(defaults, '2026-11-23', 540, now), true)
  assert.equal(customerTime({ ...defaults, lead_minutes: 1 }, '2026-11-23', 540, now), false)
  assert.equal(customerTime(defaults, date, 545, now), false)
  assert.equal(customerTime(defaults, addDays(date, 31), 600, now), false)
  assert.equal(customerTime({ ...defaults, online_enabled: false }, date, 600, now), false)
})
