import type { Context } from 'hono'
import type { Env } from '../env.ts'
import { ApiError } from '../errors.ts'

export async function jsonBody(context: Context<Env>): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(context.req.header('Content-Type') ?? '')) {
    throw new ApiError(400, 'CONTENT_TYPE', 'Kirim data dalam format JSON.')
  }
  try { return await context.req.json<unknown>() }
  catch { throw new ApiError(400, 'JSON', 'Format JSON tidak valid.') }
}
