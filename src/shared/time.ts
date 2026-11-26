export const TIME_ZONE = 'Asia/Jakarta'
export const UNIT = 5
const DAY_MS = 86_400_000
const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})
export function today(now = new Date()) {
  const parts = dateFormat.formatToParts(now)
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-')
}
export function addDays(date: string, days: number) {
  return new Date(dayNumber(date) * DAY_MS + days * DAY_MS).toISOString().slice(0, 10)
}
export function dayNumber(date: string) {
  return Date.parse(date + 'T00:00:00Z') / DAY_MS
}
export function weekday(date: string) {
  return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
}
export function monday(date: string) {
  return addDays(date, -weekday(date))
}
export function startStamp(date: string, minute: number) {
  return Date.parse(date + 'T00:00:00+07:00') + minute * 60_000
}
export function clock(minutes: number) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}
export function fromClock(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}
export const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format
export function dateLabel(date: string, short = false) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TIME_ZONE, weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long', ...(!short && { year: 'numeric' }),
  }).format(new Date(date + 'T12:00:00+07:00'))
}
