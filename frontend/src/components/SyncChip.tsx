import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react'
import { useRejected, useSyncStatus } from '../data/hooks'
import { discardOp } from '../data/outbox'
import { engine } from '../sync/engine'
import { Sheet } from './ui'

const LABEL = {
  synced: 'Synced', syncing: 'Syncing…', offline: 'Offline', waking: 'Reconnecting…', attention: 'Needs attention',
} as const

export function SyncChip() {
  const s = useSyncStatus()
  const [open, setOpen] = useState(false)
  const label = s.state === 'pending' ? `${s.pending} pending` : LABEL[s.state]
  const tone = s.state === 'attention' ? 'sync-chip-attention' : s.state === 'synced' ? 'sync-chip-synced' : 'sync-chip-working'
  const Icon = s.state === 'attention' ? AlertTriangle : s.state === 'synced' ? Check : s.state === 'offline' ? CloudOff : s.state === 'syncing' || s.state === 'waking' ? RefreshCw : LoaderCircle
  return <>
    <button data-testid="sync-chip" data-state={s.state} onClick={() => (s.rejected ? setOpen(true) : void engine.sync())}
      aria-label={`${label}${s.pending > 0 && s.state !== 'pending' ? `, ${s.pending} pending` : ''}. Tap to sync`}
      className={`sync-chip ${tone}`}>
      <Icon size={15} strokeWidth={2.2} aria-hidden="true" className={s.state === 'syncing' || s.state === 'waking' ? 'animate-spin' : ''} />
      <span>{label}</span>
      {s.state !== 'pending' && s.pending > 0 && <span className="sync-pending-count">{s.pending}</span>}
    </button>
    <AttentionSheet open={open} onClose={() => setOpen(false)} />
  </>
}

function AttentionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ops = useRejected() ?? []
  const close = useCallback(() => onClose(), [onClose])
  return <Sheet open={open} onClose={close} title="Changes needing attention">
    <div data-testid="attention-sheet" className="space-y-3">
      <p className="text-sm text-muted">Fix the record and save again, or discard the change.</p>
      <ul className="mt-4 max-h-[50vh] space-y-3 overflow-auto">
        {ops.map((o) => <li key={o.seq} data-testid="rejected-op" className="rounded-md border border-line p-3">
          <p className="text-sm font-semibold">{o.label ?? `${o.type} ${o.op}`}</p>
          <p className="mt-1 text-xs text-danger">{o.reason}</p>
          <div className="mt-3 flex gap-2">
            {o.type === 'deal' && o.op === 'upsert' && <Link to={`/deals/${o.id}/edit`} onClick={() => { void discardOp(o.seq!); onClose() }}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-pill border border-line text-sm font-bold">Fix</Link>}
            <button data-testid="rejected-op-discard" onClick={() => void discardOp(o.seq!).then(() => engine.sync())}
              className="min-h-[44px] flex-1 rounded-pill bg-danger-soft text-sm font-bold text-danger">Discard</button>
          </div>
        </li>)}
      </ul>
      {!ops.length && <p className="mt-4 text-sm text-muted">Nothing left to fix.</p>}
    </div>
  </Sheet>
}
