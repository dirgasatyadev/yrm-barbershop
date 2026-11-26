import type { z } from 'zod'

export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, public code: string, message: string, public details?: unknown) {
    super(message)
  }
}
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiError(400, 'VALIDATION', 'Periksa data yang dimasukkan.', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })))
  return result.data
}
export const notFound = (message = 'Data tidak ditemukan.') => new ApiError(404, 'NOT_FOUND', message)
export const conflict = (message = 'Data sudah berubah. Muat ulang lalu coba lagi.', details?: unknown) => new ApiError(409, 'CONFLICT', message, details)
export const dbRace = (error: unknown) => /NOT NULL constraint failed: state_version.revision|UNIQUE constraint failed: booking_slots|UNIQUE constraint failed: booking_idempotency|UNIQUE constraint failed: bookings.booking_code/.test(String(error))
