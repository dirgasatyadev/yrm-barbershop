import { Hono } from 'hono'
import { z } from 'zod'
import { availabilitySchema, barberSchema, bookingFilter, bookingPatch, bookingSchema, date, identifier,
  rotationSchema, scheduleSchema, serviceSchema, settingsSchema, shiftSchema, weekOperation } from '../../shared/schemas.ts'
import { today } from '../../shared/time.ts'
import { readState } from '../db/state.ts'
import type { Env } from '../env.ts'
import { parse } from '../errors.ts'
import { authenticate, csrf } from '../middleware/security.ts'
import { createBooking, dayAvailability, getBooking, updateBooking } from '../services/bookings.ts'
import { getWeek, runWeek, saveBusiness, saveCatalog, saveRotation, saveSchedule } from '../services/operations.ts'
import { dashboard, listBookings } from '../services/reporting.ts'
import { jsonBody } from './helpers.ts'

export const adminApi = new Hono<Env>()
adminApi.use('*', authenticate, csrf)
adminApi.get('/dashboard', async (c) => c.json({ data: await dashboard(c.env.DB) }))
adminApi.get('/availability', async (c) => {
  const q = parse(availabilitySchema, c.req.query())
  return c.json({ data: await dayAvailability(c.env.DB, q.date, q.service_id, q.barber_id, true, q.booking_id) })
})
adminApi.get('/bookings', async (c) => c.json({ data: await listBookings(c.env.DB, parse(bookingFilter, c.req.query())) }))
adminApi.post('/bookings', async (c) => {
  const key = parse(z.uuid(), c.req.header('Idempotency-Key'))
  const result = await createBooking(c.env.DB, parse(bookingSchema, await jsonBody(c)), key, c.get('admin').id)
  return c.json({ data: result.data }, result.replayed ? 200 : 201)
})
adminApi.get('/bookings/:id', async (c) => c.json({ data: await getBooking(c.env.DB, parse(identifier, c.req.param('id'))) }))
adminApi.patch('/bookings/:id', async (c) => c.json({
  data: await updateBooking(c.env.DB, parse(identifier, c.req.param('id')), c.get('admin').id, parse(bookingPatch, await jsonBody(c))),
}))
adminApi.post('/bookings/:id/cancel', async (c) => c.json({
  data: await updateBooking(c.env.DB, parse(identifier, c.req.param('id')), c.get('admin').id, { status: 'cancelled' }),
}))
const catalogs = { services: serviceSchema, barbers: barberSchema, shifts: shiftSchema } as const
for (const key of ['services', 'barbers', 'shifts'] as const) {
  adminApi.get('/' + key, async (c) => c.json({ data: (await readState(c.env.DB, today()))[key] }))
  adminApi.post('/' + key, async (c) => c.json({
    data: await saveCatalog(c.env.DB, c.get('admin').id, key, parse(catalogs[key] as z.ZodType<z.infer<typeof serviceSchema | typeof barberSchema | typeof shiftSchema>>, await jsonBody(c))),
  }, 201))
  adminApi.patch('/' + key + '/:id', async (c) => c.json({
    data: await saveCatalog(c.env.DB, c.get('admin').id, key, parse(catalogs[key] as z.ZodType<z.infer<typeof serviceSchema | typeof barberSchema | typeof shiftSchema>>, await jsonBody(c)), parse(identifier, c.req.param('id'))),
  }))
  adminApi.delete('/' + key + '/:id', async (c) => c.json({
    data: await saveCatalog(c.env.DB, c.get('admin').id, key, null, parse(identifier, c.req.param('id'))),
  }))
}
adminApi.get('/schedules', async (c) => c.json({ data: await getWeek(c.env.DB, parse(date, c.req.query('week') ?? today())) }))
adminApi.post('/schedules', async (c) => c.json({
  data: await saveSchedule(c.env.DB, c.get('admin').id, parse(scheduleSchema, await jsonBody(c))),
}, 201))
adminApi.patch('/schedules/:id', async (c) => c.json({
  data: await saveSchedule(c.env.DB, c.get('admin').id, parse(scheduleSchema, await jsonBody(c)), parse(identifier, c.req.param('id'))),
}))
for (const action of ['generate', 'rotate', 'copy'] as const) {
  adminApi.post('/schedules/' + action, async (c) => {
    const args = parse(weekOperation, await jsonBody(c))
    return c.json({ data: await runWeek(c.env.DB, c.get('admin').id, args.week, action, args.preview, args.expected_revision) })
  })
}
adminApi.get('/settings', async (c) => c.json({ data: (await readState(c.env.DB, today())).settings }))
adminApi.patch('/settings', async (c) => c.json({ data: await saveBusiness(c.env.DB, c.get('admin').id, parse(settingsSchema, await jsonBody(c))) }))
adminApi.get('/rotation', async (c) => c.json({ data: (await readState(c.env.DB, today())).rotation }))
adminApi.patch('/rotation', async (c) => c.json({ data: await saveRotation(c.env.DB, c.get('admin').id, parse(rotationSchema, await jsonBody(c))) }))
