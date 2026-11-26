import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import type { Env } from './env.ts'
import { ApiError } from './errors.ts'
import { adminApi } from './routes/admin.ts'
import { auth } from './routes/auth.ts'
import { publicMedia } from './routes/media.ts'
import { publicApi } from './routes/public.ts'

const app = new Hono<Env>()
app.use('/api/*', secureHeaders())
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})
const limitJson = bodyLimit({ maxSize: 48_000, onError: () => { throw new ApiError(413, 'SIZE', 'Data terlalu besar.') } })
app.use('/api/*', (c, next) => c.req.method === 'POST' && c.req.path === '/api/admin/media' ? next() : limitJson(c, next))
app.route('/api/public', publicApi)
app.route('/api/auth', auth)
app.route('/api/admin', adminApi)
app.route('/media', publicMedia)
app.notFound(async (c) => {
  if (c.req.path === '/api' || c.req.path.startsWith('/api/')) return c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }, 404)
  if (c.req.path.startsWith('/media/')) return c.text('Gambar tidak ditemukan.', 404)
  if (['GET', 'HEAD'].includes(c.req.method) && (c.req.path === '/admin' || c.req.path.startsWith('/admin/'))) {
    const assets = await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), { method: c.req.method }))
    const response = new Response(assets.body, assets)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.env.ASSETS.fetch(c.req.raw)
  return c.text('Metode tidak tersedia.', 405)
})
app.onError((error, c) => {
  c.header('Cache-Control', 'no-store')
  if (error instanceof ApiError) return c.json({ error: { code: error.code, message: error.message, details: error.details } }, error.status)
  console.error('YRM server error', { path: c.req.path, type: error.name, cause: error.message.split(':')[0] })
  return c.json({ error: { code: 'INTERNAL', message: 'Terjadi gangguan. Silakan coba lagi.' } }, 500)
})

export default app
