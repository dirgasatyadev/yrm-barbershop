import { QueryClient } from '@tanstack/react-query'

export class RequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message) }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; csrf?: string; key?: string; signal?: AbortSignal } = {}) {
  const headers = new Headers({ Accept: 'application/json' })
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.csrf) headers.set('X-CSRF-Token', options.csrf)
  if (options.key) headers.set('Idempotency-Key', options.key)
  const response = await fetch('/api' + path, {
    method: options.method ?? 'GET', headers, credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal,
  })
  const result = await response.json().catch(() => null) as
    { data?: T; error?: { code: string; message: string; details?: unknown } } | null
  if (!response.ok || result?.data === undefined) {
    throw new RequestError(response.status, result?.error?.code ?? 'NETWORK', result?.error?.message ?? 'Koneksi bermasalah. Coba lagi.', result?.error?.details)
  }
  return result.data
}
export function errorText(error: unknown) {
  if (error instanceof RequestError) {
    const details = error.details
    if (details && typeof details === 'object' && 'bookings' in details && Array.isArray(details.bookings)) {
      return error.message + ' Kode: ' + details.bookings.join(', ')
    }
    if (Array.isArray(details) && typeof details[0]?.message === 'string') return error.message + ' ' + details[0].message
    return error.message
  }
  return 'Koneksi bermasalah. Silakan coba lagi.'
}
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: (count, error) => count < 1 && (!(error instanceof RequestError) || error.status >= 500) } },
})
export const publicKey = (item: string) => ['public', item] as const
export const adminKey = (...rest: (string | number)[]) => ['admin', ...rest] as const
