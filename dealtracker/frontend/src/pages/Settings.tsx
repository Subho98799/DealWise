import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { useDeleteAccount, useLogout, useUpdateSettings } from '../lib/auth'
import { useUser, useSyncStatus } from '../data/hooks'
import { input } from '../components/ui'
import { Link } from 'react-router-dom'

export default function SettingsPage() {
  const me = useUser()
  const logout = useLogout()
  const sync = useSyncStatus()
  const doLogout = () => {
    if (sync.pending && !window.confirm(`${sync.pending} change(s) are not synced yet and will be lost. Log out anyway?`)) return
    logout.mutate()
  }

  return (
    <div data-testid="settings-page" className="space-y-6">
      <h1 className="rise text-2xl font-extrabold tracking-tight">Settings</h1>

      <section data-testid="account-card" className="rise flex items-center gap-4 rounded-lg bg-surface p-5 shadow-card">
        <Avatar name={me.name} url={me.avatar_url} size={48} />
        <div className="min-w-0">
          <p data-testid="account-name" className="truncate font-bold">{me.name ?? 'No name'}</p>
          <p data-testid="account-email" className="truncate text-sm text-muted">{me.email}</p>
        </div>
      </section>

      <button
        data-testid="logout-button"
        onClick={doLogout}
        disabled={logout.isPending}
        className="h-12 w-full rounded-pill border border-line bg-surface text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {logout.isPending ? 'Logging out…' : 'Log out'}
      </button>
      {logout.isError && <p data-testid="logout-error" role="alert" className="text-sm font-semibold text-danger">You need a connection to log out. Your data stays on this device until then.</p>}

      <section data-testid="settings-import" className="rounded-lg bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold md:text-lg">Bring in past deals</h2>
        <p className="mt-1 text-sm text-muted">Import an Excel or CSV file, review the rows, and undo the import if needed.</p>
        <Link to="/import" data-testid="settings-import-link" className="mt-4 inline-flex min-h-[48px] items-center rounded-pill bg-primary px-5 text-sm font-bold text-primary-ink">Import deals</Link>
      </section>

      <Preferences />
      <DeleteAccount />
    </div>
  )
}

function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const del = useDeleteAccount()
  const confirmed = typed === 'DELETE'

  return (
    <section className="rounded-lg border border-line p-5">
      <h2 className="text-base font-bold text-danger md:text-lg">Danger zone</h2>
      <p className="mt-1 text-sm text-muted">This permanently removes your account, deals and mediators.</p>
      {!open ? (
        <button
          data-testid="delete-account-open-button"
          onClick={() => setOpen(true)}
          className="mt-4 h-12 w-full rounded-pill bg-danger-soft text-sm font-bold text-danger transition-transform active:scale-[0.98]"
        >
          Delete my account and all my data
        </button>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (confirmed) del.mutate()
          }}
        >
          <label htmlFor="confirm-delete" className="block text-sm">
            Type <b>DELETE</b> to confirm
          </label>
          <input
            id="confirm-delete"
            data-testid="delete-account-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-12 w-full rounded-sm border border-line bg-surface px-4 text-base outline-none focus:border-danger"
          />
          {del.isError && (
            <p data-testid="delete-account-error" role="alert" className="text-sm font-semibold text-danger">
              {del.error.message}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              data-testid="delete-account-cancel-button"
              onClick={() => {
                setOpen(false)
                setTyped('')
              }}
              className="h-12 flex-1 rounded-pill border border-line text-sm font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="delete-account-confirm-button"
              disabled={!confirmed || del.isPending}
              className="h-12 flex-1 rounded-pill bg-danger text-sm font-bold text-white transition-opacity disabled:opacity-40"
            >
              {del.isPending ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

const ZONES: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['Asia/Kolkata', 'UTC']

function Preferences() {
  const me = useUser()
  const save = useUpdateSettings()
  return (
    <section data-testid="preferences" className="space-y-4 rounded-lg bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold md:text-lg">Deadline alerts</h2>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Warn me this many days before a deadline</span>
        <select data-testid="settings-alert-days-select" value={me.alert_days} className={input}
          onChange={(e) => save.mutate({ alert_days: Number(e.target.value) })}>
          {Array.from({ length: 15 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Only on the day' : `${i} day${i > 1 ? 's' : ''}`}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Time zone</span>
        <select data-testid="settings-timezone-select" value={me.timezone} className={input} onChange={(e) => save.mutate({ timezone: e.target.value })}>
          {(ZONES.includes(me.timezone) ? ZONES : [me.timezone, ...ZONES]).map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </label>
      {save.isError && <p data-testid="settings-error" role="alert" className="text-sm font-semibold text-danger">Could not save (are you online?). {save.error.message}</p>}
      {save.isSuccess && <p data-testid="settings-saved" className="text-sm text-primary">Saved.</p>}
    </section>
  )
}
