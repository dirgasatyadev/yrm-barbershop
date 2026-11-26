import { Hono } from 'hono'
import { z } from 'zod'
import { availabilitySchema, bookingSchema, date } from '../../shared/schemas.ts'
import { today } from '../../shared/time.ts'
import { readState } from '../db/state.ts'
import type { Env } from '../env.ts'
import { parse } from '../errors.ts'
import { rate, sameOrigin } from '../middleware/security.ts'
import { createBooking, dayAvailability } from '../services/bookings.ts'
import { workFor } from '../services/calendar.ts'
import { jsonBody } from './helpers.ts'

export const publicApi = new Hono<Env>()
publicApi.get('/settings', async (c) => {
  const { settings } = await readState(c.env.DB, today())
  return c.json({ data: settings })
})
publicApi.get('/services', async (c) => {
  const state = await readState(c.env.DB, today())
  return c.json({ data: state.services.filter((option) => option.is_active) })
})
publicApi.get('/barbers', async (c) => {
  const current = parse(date, c.req.query('date') ?? today())
  const state = await readState(c.env.DB, current)
  return c.json({ data: state.barbers.filter((barber) => barber.is_active).map((barber) => ({ ...barber, work: workFor(state, barber, current) })) })
})
publicApi.get('/availability', async (c) => {
  const query = parse(availabilitySchema.omit({ booking_id: true }), c.req.query())
  return c.json({ data: await dayAvailability(c.env.DB, query.date, query.service_id, query.barber_id) })
})
publicApi.post('/bookings', sameOrigin, async (c) => {
  await rate(c, 'booking', 15, 600)
  const key = parse(z.uuid(), c.req.header('Idempotency-Key'))
  const input = parse(bookingSchema, await jsonBody(c))
  const result = await createBooking(c.env.DB, input, key)
  return c.json({ data: result.data }, result.replayed ? 200 : 201)
})
