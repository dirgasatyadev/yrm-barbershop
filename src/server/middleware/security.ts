import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { ApiError } from '../errors.ts'
import type { Env } from '../env.ts'
import { digest, equals } from '../services/crypto.ts'

export const cookieName = (production: boolean) => production ? '__Host-yrm_session' : 'yrm_session'
export const sessionCookie = (context: Context<Env>) => getCookie(context, cookieName(context.env.APP_ENV === 'production'))

export async function rate(context: Context<Env>, scope: string, maximum: number, seconds: number, subject?: string) {
  const ip = context.req.header('CF-Connecting-IP') ?? 'local'
  const key = await digest(JSON.stringify([context.env.RATE_LIMIT_SECRET ?? '', scope, subject ?? ip]))
  const now = Math.floor(Date.now() / 1000)
  const db = context.env.DB
  const statements = [db.prepare(`INSERT INTO rate_limits (key, hits, expires_at) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING hits`)
    .bind(key, now + seconds, now, now)]
  if (crypto.getRandomValues(new Uint8Array(1))[0] < 16) {
    statements.push(db.prepare('DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at <= ? LIMIT 100)').bind(now))
  }
  const [result] = await db.batch<{ hits: number }>(statements)
  if (result.results[0].hits > maximum) {
    context.header('Retry-After', String(seconds))
    throw new ApiError(429, 'RATE_LIMIT', 'Terlalu banyak percobaan. Silakan coba kembali nanti.')
  }
}
export const sameOrigin: MiddlewareHandler<Env> = async (context, next) => {
  const origin = context.req.header('Origin')
  if (origin !== new URL(context.req.url).origin || context.req.header('Sec-Fetch-Site') === 'cross-site') {
    throw new ApiError(403, 'ORIGIN', 'Permintaan harus berasal dari situs ini.')
  }
  await next()
}

export const authenticate: MiddlewareHandler<Env> = async (context, next) => {
  const token = sessionCookie(context)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'AUTH', 'Silakan masuk sebagai admin.')
  const row = await context.env.DB.prepare(`SELECT s.id AS session_id, a.id, a.username, a.email
    FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.is_active = 1`)
    .bind(await digest(token), Date.now()).first<{ session_id: string; id: string; username: string; email: string }>()
  if (!row) throw new ApiError(401, 'AUTH', 'Sesi berakhir. Silakan masuk kembali.')
  const { session_id, ...admin } = row
  context.set('sessionId', session_id)
  context.set('admin', { ...admin, csrf: await digest('yrm-csrf:' + token) })
  await next()
}
export const csrf: MiddlewareHandler<Env> = async (context, next) => {
  if (['GET', 'HEAD'].includes(context.req.method)) return next()
  await sameOrigin(context, async () => {
    const supplied = context.req.header('X-CSRF-Token') ?? ''
    if (!equals(context.get('admin').csrf, supplied)) throw new ApiError(403, 'CSRF', 'Sesi formulir tidak valid. Muat ulang halaman.')
    await next()
  })
}
