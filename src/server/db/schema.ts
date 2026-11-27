import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamp = () => text().notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)
const timestamps = () => ({ created_at: timestamp(), updated_at: timestamp() })
const active = () => integer({ mode: 'boolean' }).notNull().default(true)
const order = () => integer().notNull().default(0)
const id = () => text().primaryKey().notNull()

export const admins = sqliteTable('admins', {
  id: id(), username: text().notNull().unique(), email: text().notNull().unique(),
  password_hash: text().notNull(), is_active: active(), ...timestamps(),
})
export const adminSessions = sqliteTable('admin_sessions', {
  id: id(), admin_id: text().notNull().references(() => admins.id, { onDelete: 'cascade' }),
  token_hash: text().notNull().unique(), expires_at: integer().notNull(), created_at: timestamp(),
}, (t) => [index('sessions_expires').on(t.expires_at)])
export const services = sqliteTable('services', {
  id: id(), name: text().notNull(), description: text().notNull(),
  price: integer().notNull(), duration_minutes: integer().notNull(), sort_order: order(), is_active: active(), ...timestamps(),
}, (t) => [
  check('services_price', sql`${t.price} >= 0`),
  check('services_duration', sql`${t.duration_minutes} between 5 and 480 and ${t.duration_minutes} % 5 = 0`),
])
export const barbers = sqliteTable('barbers', {
  id: id(), name: text().notNull(), photo_url: text().notNull(), description: text().notNull(),
  sort_order: order(), is_active: active(), ...timestamps(),
})
export const shifts = sqliteTable('shifts', {
  id: id(), name: text().notNull(), start_time: integer().notNull(), end_time: integer().notNull(),
  is_active: active(), ...timestamps(),
}, (t) => [check('shift_bounds', sql`${t.start_time} >= 0 and ${t.end_time} <= 1440 and ${t.start_time} < ${t.end_time} and ${t.start_time} % 5 = 0 and ${t.end_time} % 5 = 0`)])
export const schedules = sqliteTable('barber_schedules', {
  id: id(), barber_id: text().notNull().references(() => barbers.id),
  shift_id: text().references(() => shifts.id), schedule_date: text().notNull(),
  start_time: integer(), end_time: integer(), is_day_off: integer({ mode: 'boolean' }).notNull().default(false),
  notes: text().notNull().default(''), ...timestamps(),
}, (t) => [
  uniqueIndex('schedule_barber_date').on(t.barber_id, t.schedule_date),
  index('schedule_date').on(t.schedule_date),
  check('schedule_range', sql`(${t.start_time} is null and ${t.end_time} is null) or (${t.start_time} is not null and ${t.end_time} is not null and ${t.start_time} >= 0 and ${t.end_time} <= 1440 and ${t.start_time} < ${t.end_time} and ${t.start_time} % 5 = 0 and ${t.end_time} % 5 = 0)`),
])
export const bookings = sqliteTable('bookings', {
  id: id(), booking_code: text().notNull().unique(), customer_name: text().notNull(),
  customer_phone: text().notNull(), customer_notes: text().notNull(),
  service_id: text().notNull().references(() => services.id),
  barber_id: text().notNull().references(() => barbers.id),
  service_name_snapshot: text().notNull(), barber_name_snapshot: text().notNull(),
  price_snapshot: integer().notNull(), duration_snapshot: integer().notNull(),
  booking_date: text().notNull(), start_time: integer().notNull(), end_time: integer().notNull(),
  status: text({ enum: ['confirmed', 'completed', 'cancelled', 'no_show'] }).notNull(), ...timestamps(),
}, (t) => [
  index('bookings_date_start').on(t.booking_date, t.start_time),
  index('bookings_created').on(t.created_at),
  index('bookings_barber_date').on(t.barber_id, t.booking_date),
  check('booking_status', sql`${t.status} in ('confirmed','completed','cancelled','no_show')`),
  check('booking_bounds', sql`${t.start_time} >= 0 and ${t.end_time} <= 1440 and ${t.end_time}-${t.start_time} = ${t.duration_snapshot} and ${t.duration_snapshot} between 5 and 480 and ${t.start_time} % 5 = 0 and ${t.duration_snapshot} % 5 = 0 and ${t.price_snapshot} >= 0`),
])
export const bookingSlots = sqliteTable('booking_slots', {
  id: integer().primaryKey({ autoIncrement: true }),
  booking_id: text().notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  barber_id: text().notNull().references(() => barbers.id),
  booking_date: text().notNull(), slot_start: integer().notNull(), created_at: timestamp(),
}, (t) => [
  uniqueIndex('slot_barber_date_start').on(t.barber_id, t.booking_date, t.slot_start),
  index('slot_booking').on(t.booking_id),
  index('slot_date').on(t.booking_date),
  check('slot_grid', sql`${t.slot_start} >= 0 and ${t.slot_start} < 1440 and ${t.slot_start} % 5 = 0`),
])
export const settings = sqliteTable('business_settings', {
  key: text().primaryKey().notNull(), value: text({ mode: 'json' }).notNull(), updated_at: timestamp(),
})
export const auditLogs = sqliteTable('audit_logs', {
  id: id(), admin_id: text().notNull().references(() => admins.id),
  action: text().notNull(), entity_type: text().notNull(), entity_id: text().notNull(),
  metadata: text({ mode: 'json' }).notNull(), created_at: timestamp(),
}, (t) => [index('audit_created').on(t.created_at)])
export const stateVersion = sqliteTable('state_version', { id: integer().primaryKey(), revision: integer().notNull() })
export const idempotency = sqliteTable('booking_idempotency', {
  key: text().primaryKey().notNull(), fingerprint: text().notNull(), response: text({ mode: 'json' }).notNull(),
  booking_id: text().notNull().references(() => bookings.id, { onDelete: 'cascade' }), created_at: timestamp(),
}, (t) => [index('booking_idempotency_booking').on(t.booking_id)])
export const deletedBookingRequests = sqliteTable('deleted_booking_requests', { key: id() })
export const bookingNotifications = sqliteTable('booking_notifications', {
  id: integer().primaryKey({ autoIncrement: true }),
  booking_id: text().notNull().unique().references(() => bookings.id, { onDelete: 'cascade' }),
})
export const adminBookingInbox = sqliteTable('admin_booking_inbox', {
  admin_id: id().references(() => admins.id, { onDelete: 'cascade' }),
  last_seen_id: integer().notNull(),
})
export const rateLimits = sqliteTable('rate_limits', {
  key: text().primaryKey().notNull(), hits: integer().notNull(), expires_at: integer().notNull(),
}, (t) => [index('rate_expiry').on(t.expires_at)])
