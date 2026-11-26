import type { AdminUser } from '../shared/types.ts'

export type Env = {
  Bindings: { DB: D1Database; ASSETS: Fetcher; APP_ENV: 'development' | 'production'; RATE_LIMIT_SECRET?: string }
  Variables: { admin: AdminUser; sessionId: string }
}
