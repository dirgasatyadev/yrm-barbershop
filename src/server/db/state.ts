import { drizzle } from 'drizzle-orm/d1'
import { asc, between, eq } from 'drizzle-orm'
import { defaults, emptyRotation, rotationSchema, settingsSchema } from '../../shared/schemas.ts'
import type { Barber, Rotation, Schedule, Service, Settings, Shift } from '../../shared/types.ts'
import * as db from './schema.ts'

export type State = {
  revision: number; settings: Settings; rotation: Rotation; services: Service[];
  barbers: Barber[]; shifts: Shift[]; schedules: Schedule[];
}
export async function readState(binding: D1Database, from: string, through = from): Promise<State> {
  const orm = drizzle(binding)
  const [versions, config, services, barbers, shifts, schedules] = await orm.batch([
    orm.select().from(db.stateVersion).where(eq(db.stateVersion.id, 1)),
    orm.select().from(db.settings),
    orm.select().from(db.services).orderBy(asc(db.services.sort_order), asc(db.services.name)),
    orm.select().from(db.barbers).orderBy(asc(db.barbers.sort_order), asc(db.barbers.name)),
    orm.select().from(db.shifts).orderBy(asc(db.shifts.start_time), asc(db.shifts.name)),
    orm.select().from(db.schedules).where(between(db.schedules.schedule_date, from, through)),
  ])
  if (!versions[0]) throw new Error('state_version missing; apply D1 migrations')
  return {
    revision: versions[0].revision,
    settings: settingsSchema.parse({ ...defaults, ...Object(config.find((r) => r.key === 'business')?.value) }),
    rotation: rotationSchema.parse(config.find((r) => r.key === 'rotation')?.value ?? emptyRotation),
    services, barbers, shifts, schedules,
  }
}

export function revisionGuard(db: D1Database, revision: number) {
  return db.prepare('UPDATE state_version SET revision = CASE WHEN revision = ? THEN revision + 1 ELSE NULL END WHERE id = 1').bind(revision)
}
export function audit(db: D1Database, admin: string, action: string, entity: string, id: string, metadata: object = {}) {
  return db.prepare('INSERT INTO audit_logs (id, admin_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), admin, action, entity, id, JSON.stringify(metadata))
}
export function saveSetting(db: D1Database, key: string, value: unknown) {
  return db.prepare(`INSERT INTO business_settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(key, JSON.stringify(value))
}
