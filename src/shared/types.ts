import type { z } from 'zod'
import type { barberSchema, bookingSchema, rotationSchema, scheduleSchema, serviceSchema, settingsSchema, shiftSchema, statusSchema } from './schemas.ts'

export type Settings = z.infer<typeof settingsSchema>
export type Service = z.infer<typeof serviceSchema> & { id: string }
export type Barber = z.infer<typeof barberSchema> & { id: string }
export type Shift = z.infer<typeof shiftSchema> & { id: string }
export type Schedule = z.infer<typeof scheduleSchema> & { id: string }
export type Rotation = z.infer<typeof rotationSchema>
export type BookingInput = z.infer<typeof bookingSchema>
export type BookingStatus = z.infer<typeof statusSchema>
export type BookingSummary = {
  id: string; booking_code: string; customer_name: string; service_name_snapshot: string;
  barber_name_snapshot: string; price_snapshot: number; duration_snapshot: number;
  booking_date: string; start_time: number; end_time: number; status: BookingStatus;
}
export type Booking = BookingSummary & {
  service_id: string; barber_id: string; customer_phone: string; customer_notes: string;
  created_at: string; updated_at: string;
}
export type BookingReceipt = BookingSummary & { confirmation: string }
export type Work = { start: number; end: number; label: string; is_day_off: false } | { is_day_off: true; label: string }
export type CapsterStatus = 'available' | 'booked' | 'off' | 'outside'
export type TimeSlot = { start: number; end: number; state: 'available' | 'full' | 'unavailable'; barbers: { id: string; status: CapsterStatus }[] }
export type BarberWork = Barber & { work: Work }
export type Availability = { date: string; slots: TimeSlot[]; barbers: BarberWork[] }
export type WeekCell = { barber_id: string; date: string; work: Work; schedule: Schedule | null; conflicts: string[] }
export type AdminUser = { id: string; username: string; email: string; csrf: string }
export type Dashboard = {
  date: string; total: number; upcoming: number; completed: number; cancelled: number; estimate: number; completed_value: number;
  active: number; schedule: BarberWork[]; week: { date: string; total: number }[]; popular: { name: string; total: number }[]; recent: Booking[];
}
