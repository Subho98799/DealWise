// E2E auth WITHOUT any backdoor route: insert a user + session row straight into the TEST database,
// then put the raw token in the browser cookie, exactly like a real login would.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import type { BrowserContext } from '@playwright/test'

const url = process.env.E2E_DATABASE_URL
if (!url) throw new Error('E2E_DATABASE_URL is not set (app_user URL of the TEST database the backend uses).')
if (!new URL(url).pathname.toLowerCase().includes('test')) throw new Error('E2E_DATABASE_URL must point at a database whose name contains "test".')

export const pool = new pg.Pool({ connectionString: url })
const SESSION_COOKIE = 'dt_session' // backend app/config.py SESSION_COOKIE

export async function createUser(name: string) {
  const sub = `e2e-${randomUUID()}`
  const { rows } = await pool.query('INSERT INTO users (google_sub, email, name) VALUES ($1, $2, $3) RETURNING id',
    [sub, `${sub}@example.com`, name])
  const token = randomBytes(32).toString('base64url')
  await pool.query("INSERT INTO sessions (user_id, token_hash, expires_at, last_seen_at) VALUES ($1, $2, now() + interval '1 day', now())",
    [rows[0].id, createHash('sha256').update(token).digest('hex')])
  return { id: rows[0].id as string, token }
}

export async function useSession(ctx: BrowserContext, baseURL: string, token: string) {
  await ctx.clearCookies()
  await ctx.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL, httpOnly: true, sameSite: 'Lax' }])
}

/** Reads a user's deals through RLS, as the app does. */
export async function serverDeals(userId: string) {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await c.query("SELECT set_config('app.current_user_id', $1, true)", [userId])
    const { rows } = await c.query('SELECT product, review_status, deleted_at FROM deals')
    await c.query('ROLLBACK')
    return rows as { product: string; review_status: string; deleted_at: string | null }[]
  } finally {
    c.release()
  }
}

export async function cleanup() {
  await pool.query("DELETE FROM users WHERE google_sub LIKE 'e2e-%'")
}
