import { z } from 'zod'
import { isMediaImage } from './media.ts'

export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
export const date = z.iso.date().refine((value) => value >= '2000-01-01' && value <= '2099-12-31', 'Tanggal di luar rentang')
const minute = z.number().int().min(0).max(1440).multipleOf(5)
const sort = z.number().int().min(0).max(9999)
const name = z.string().trim().min(2, 'Minimal 2 karakter').max(100)
const description = z.string().trim().max(1000)
const httpsUrl = z.url({ protocol: /^https$/ }).max(2048)
const optionalLink = z.union([z.literal(''), httpsUrl])
const imageUrl = z.union([optionalLink, z.string().refine(isMediaImage)])
export const phone = z.string().trim().max(30).refine((value) => value === '' ||
  (/^\+?[0-9 ()-]+$/.test(value) && /^\d{8,15}$/.test(value.replace(/\D/g, ''))), 'Masukkan nomor WhatsApp yang valid')
const businessPhone = z.string().trim().regex(/^(?:\+?[1-9]\d{7,14})?$/, 'Gunakan kode negara, misalnya 62, diikuti nomor')
export const customerSchema = z.object({ customer_name: name, customer_phone: phone.default(''), customer_notes: z.string().trim().max(500).default('') })
export const serviceSchema = z.object({ name, description, price: z.number().int().min(0).max(100_000_000),
  duration_minutes: z.number().int().min(5).max(480).multipleOf(5), sort_order: sort, is_active: z.boolean() })
export const barberSchema = z.object({ name, photo_url: imageUrl, description, sort_order: sort, is_active: z.boolean() })
export const shiftSchema = z.object({ name, start_time: minute, end_time: minute, is_active: z.boolean() })
  .refine((value) => value.start_time < value.end_time, { message: 'Jam selesai harus setelah jam mulai', path: ['end_time'] })
const settingsFields = z.object({
  name, logo_url: imageUrl, description, whatsapp: businessPhone, address: z.string().trim().max(400),
  cover_url: imageUrl, background_url: imageUrl, contact_phone: businessPhone,
  instagram_url: optionalLink, tiktok_url: optionalLink, facebook_url: optionalLink,
  opens: minute, closes: minute, interval: z.number().int().min(5).max(120).multipleOf(5),
  max_days: z.number().int().min(0).max(90), lead_minutes: z.number().int().min(0).max(10080),
  phone_required: z.boolean(), online_enabled: z.boolean(), confirmation: z.string().trim().max(500),
  confirm_notice: z.string().trim().max(500),
})
export const settingsSchema = settingsFields.refine((value) => value.opens < value.closes, { message: 'Jam tutup harus setelah jam buka', path: ['closes'] })
export const settingsPatchSchema = settingsFields.partial()
export const defaults: z.infer<typeof settingsSchema> = {
  name: 'YRM Barber', logo_url: '', description: 'YRM Barber berdiri sejak 2014 dan melayani potong rambut dengan capster profesional.',
  cover_url: '', background_url: '', contact_phone: '', instagram_url: '', tiktok_url: '', facebook_url: '',
  whatsapp: '', address: '', opens: 480, closes: 1200, interval: 30, max_days: 30, lead_minutes: 0,
  phone_required: false, online_enabled: true, confirmation: 'Simpan kode reservasi dan tunjukkan saat kamu tiba.',
  confirm_notice: 'Usahakan datang tepat waktu agar jadwal reservasi berikutnya tidak terganggu.',
}
export const scheduleSchema = z.object({
  barber_id: identifier, schedule_date: date, shift_id: identifier.nullable(),
  start_time: minute.nullable(), end_time: minute.nullable(), is_day_off: z.boolean(), notes: z.string().trim().max(300).default(''),
}).refine((v) => v.is_day_off ? !v.shift_id && v.start_time === null && v.end_time === null :
  v.shift_id ? v.start_time === null && v.end_time === null :
    v.start_time !== null && v.end_time !== null && v.start_time < v.end_time, 'Pilih shift, libur, atau masukkan rentang jam yang valid')
export const rotationSchema = z.object({
  anchor: date, rules: z.array(z.object({ barber_id: identifier, week: z.number().int().min(0).max(11),
    shift_id: identifier, off_weekday: z.number().int().min(0).max(6) })).max(120),
  length: z.number().int().min(1).max(12),
}).refine((v) => v.rules.every((rule) => rule.week < v.length) &&
  new Set(v.rules.map((rule) => rule.barber_id + ':' + rule.week)).size === v.rules.length, 'Setiap capster hanya boleh memiliki satu pola per minggu')
export const emptyRotation: z.infer<typeof rotationSchema> = { anchor: '2026-01-05', length: 1, rules: [] }
export const bookingSchema = customerSchema.extend({
  date, start: minute, service_id: identifier, barber_id: identifier.nullable().default(null),
  quote: serviceSchema.pick({ price: true, duration_minutes: true }).optional(),
})
export const availabilitySchema = z.object({ date, service_id: identifier, barber_id: identifier.optional(), booking_id: identifier.optional() })
export const statusSchema = z.enum(['confirmed', 'completed', 'cancelled', 'no_show'])
export const bookingPatch = z.union([
  z.object({ status: statusSchema }).strict(),
  z.object({ date, start: minute, barber_id: identifier }).strict(),
])
export const weekOperation = z.object({ week: date, preview: z.boolean().default(true), expected_revision: z.number().int().min(0).optional() })
export const loginSchema = z.object({ identifier: z.string().trim().toLowerCase().min(1).max(254), password: z.string().min(1).max(256) })
export const bookingFilter = z.object({
  q: z.string().trim().max(100).default(''), date: date.optional(), barber_id: identifier.optional(),
  service_id: identifier.optional(), status: statusSchema.optional(), page: z.coerce.number().int().min(1).max(10000).default(1),
  order: z.enum(['recent', 'schedule']).default('recent'),
})
