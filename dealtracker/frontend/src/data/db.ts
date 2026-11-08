import Dexie, { type Table } from 'dexie'
import { LOCAL_DB_NAME, STORAGE_PREFIX } from '../config/app'
import type { Deal, Mediator, OutboxOp } from './types'

// The UI reads ONLY from this local replica. One database per device, owned by exactly one user.
export class LocalDB extends Dexie {
  deals!: Table<Deal, string>
  mediators!: Table<Mediator, string>
  outbox!: Table<OutboxOp, number>
  meta!: Table<{ key: string; value: string }, string>

  constructor() {
    super(LOCAL_DB_NAME)
    this.version(1).stores({
      deals: 'id, updated_at, mediator_id',
      mediators: 'id, name',
      outbox: '++seq, op_id, status, id',
      meta: 'key',
    })
  }
}

export let db = new LocalDB()

export async function getMeta(key: string): Promise<string | null> {
  return (await db.meta.get(key))?.value ?? null
}
export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** Deletes every local trace of the signed-in user (IndexedDB + our localStorage keys). */
export async function wipeLocal(): Promise<void> {
  db.close()
  await Dexie.delete(LOCAL_DB_NAME)
  db = new LocalDB()
  for (const k of Object.keys(localStorage)) if (k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k)
}

/** Opens the local store for this user; wipes it first if it belongs to someone else (account switch). */
export async function openFor(userId: string): Promise<void> {
  const owner = await getMeta('owner')
  if (owner && owner !== userId) await wipeLocal()
  await setMeta('owner', userId)
}

export const local = {
  get: (key: string) => localStorage.getItem(STORAGE_PREFIX + key),
  set: (key: string, v: string) => localStorage.setItem(STORAGE_PREFIX + key, v),
  remove: (key: string) => localStorage.removeItem(STORAGE_PREFIX + key),
}
