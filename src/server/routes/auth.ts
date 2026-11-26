import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import type { Env } from '../env.ts'
import { ApiError, parse } from '../errors.ts'
import { loginSchema } from '../../shared/schemas.ts'
import { digest, randomHex, verifyPassword } from '../services/crypto.ts'
import { authenticate, cookieName, csrf, rate, sameOrigin } from '../middleware/security.ts'
import { jsonBody } from './helpers.ts'

const sessionSeconds = 12 * 60 * 60
export const auth = new Hono<Env>()
auth.post('/login', sameOrigin, async (c) => {
  await rate(c, 'login-ip', 12, 900)
  const input = parse(loginSchema, await jsonBody(c))
  await rate(c, 'login-account', 30, 900, input.identifier)
  const db = c.env.DB
  const admin = await db.prepare('SELECT id, username, email, password_hash FROM admins WHERE (username = ? OR email = ?) AND is_active = 1')
    .bind(input.identifier, input.identifier).first<{ id: string; username: string; email: string; password_hash: string }>()
  if (!await verifyPassword(input.password, admin?.password_hash) || !admin) throw new ApiError(401, 'CREDENTIALS', 'Username, email, atau kata sandi tidak tepat.')
  const token = randomHex(32)
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), admin.id, await digest(token), now + sessionSeconds * 1000),
  ])
  const secure = c.env.APP_ENV === 'production'
  setCookie(c, cookieName(secure), token, { httpOnly: true, secure, sameSite: 'Strict', path: '/', maxAge: sessionSeconds })
  return c.json({ data: { id: admin.id, username: admin.username, email: admin.email, csrf: await digest('yrm-csrf:' + token) } })
})
auth.get('/me', authenticate, (c) => c.json({ data: c.get('admin') }))
auth.post('/logout', authenticate, csrf, async (c) => {
  await c.env.DB.prepare('DELETE FROM admin_sessions WHERE id = ?').bind(c.get('sessionId')).run()
  const secure = c.env.APP_ENV === 'production'
  deleteCookie(c, cookieName(secure), { httpOnly: true, secure, sameSite: 'Strict', path: '/' })
  return c.json({ data: { success: true } })
})
