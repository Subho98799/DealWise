import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRejected, useSyncStatus } from '../data/hooks'
import { discardOp } from '../data/outbox'
import { engine } from '../sync/engine'

const LABEL = {
  synced: 'Synced', syncing: 'Syncing…', offline: 'Offline', waking: 'Waking server…', attention: 'Needs attention',
} as const

export function SyncChip() {
  const s = useSyncStatus()
  const [open, setOpen] = useState(false)
  const label = s.state === 'pending' ? `${s.pending} pending` : LABEL[s.state]
  const tone = s.state === 'attention' ? 'bg-danger-soft text-danger' : s.state === 'synced' ? 'bg-surface-2 text-muted' : 'bg-accent/25 text-ink'
  return (
    <>
      <button data-testid="sync-chip" data-state={s.state} onClick={() => (s.rejected ? setOpen(true) : void engine.sync())}
        className={`flex min-h-[36px] items-center gap-2 rounded-pill px-3 text-xs font-bold ${tone}`}>
        <span className={`h-2 w-2 rounded-pill ${s.state === 'synced' ? 'bg-primary' : s.state === 'attention' ? 'bg-danger' : 'bg-accent'}`} />
        {label}
        {s.state !== 'pending' && s.pending > 0 && <span>· {s.pending}</span>}
      </button>
      {open && <AttentionSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function AttentionSheet({ onClose }: { onClose: () => void }) {
  const ops = useRejected() ?? []
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div data-testid="attention-sheet" onClick={(e) => e.stopPropagation()}
        className="safe-bottom mx-auto w-full max-w-md rounded-t-lg bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold">Changes the server refused</h2>
        <p className="mt-1 text-sm text-muted">Fix the record and save again, or discard the change.</p>
        <ul className="mt-4 max-h-[50vh] space-y-3 overflow-auto">
          {ops.map((o) => (
            <li key={o.seq} data-testid="rejected-op" className="rounded-md border border-line p-3">
              <p className="text-sm font-semibold">{o.label ?? `${o.type} ${o.op}`}</p>
              <p className="mt-1 text-xs text-danger">{o.reason}</p>
              <div className="mt-3 flex gap-2">
                {o.type === 'deal' && o.op === 'upsert' && (
                  <Link to={`/deals/${o.id}/edit`} onClick={() => { void discardOp(o.seq!); onClose() }}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-pill border border-line text-sm font-bold">Fix</Link>
                )}
                <button data-testid="rejected-op-discard" onClick={() => void discardOp(o.seq!).then(() => engine.sync())}
                  className="min-h-[44px] flex-1 rounded-pill bg-danger-soft text-sm font-bold text-danger">Discard</button>
              </div>
            </li>
          ))}
        </ul>
        {!ops.length && <p className="mt-4 text-sm text-muted">Nothing left to fix.</p>}
      </div>
    </div>
  )
}
