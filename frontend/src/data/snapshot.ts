import type { Deal } from './types'

const SERVER_FIELDS = new Set(['id', 'client_id', 'created_at', 'updated_at', 'refund_amount'])

/** The whole deal minus server-owned columns, so one op can always create or replace the record. */
export const dealSnapshot = (deal: Deal) => Object.fromEntries(Object.entries(deal).filter(([key]) => !SERVER_FIELDS.has(key)))
