import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import { useDeleteAccount, useLogout, useMe } from '../lib/auth'

export default function SettingsPage() {
  const { data: me } = useMe()
  const logout = useLogout()
  if (!me) return null

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
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="h-12 w-full rounded-pill border border-line bg-surface text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {logout.isPending ? 'Logging out…' : 'Log out'}
      </button>

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
