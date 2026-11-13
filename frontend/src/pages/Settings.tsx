import { useState } from 'react'
import { ArrowRight, Check, Clock3, Monitor, Moon, Palette, Sun, Upload } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { SettingsInstallRow } from '../components/InstallPrompt'
import { useDeleteAccount, useLogout, useUpdateSettings } from '../lib/auth'
import { useUser, useSyncStatus } from '../data/hooks'
import { btn, input, PageTitle, SegmentedControl } from '../components/ui'
import { Link } from 'react-router-dom'
import { readAppearance, readColorTheme, saveAppearance, saveColorTheme, type Appearance, type ColorTheme } from '../lib/appearance'

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
      <PageTitle>Settings</PageTitle>

      <section data-testid="account-card" className="settings-account-card">
        <Avatar name={me.name} url={me.avatar_url} size={48} />
        <div className="min-w-0">
          <span className="section-eyebrow">Signed in</span>
          <p data-testid="account-name" className="truncate font-display font-bold">{me.name ?? 'No name'}</p>
          <p data-testid="account-email" className="truncate text-sm text-muted">{me.email}</p>
        </div>
        <span className="settings-account-check" aria-hidden="true">✓</span>
      </section>

      <button
        data-testid="logout-button"
        onClick={doLogout}
        disabled={logout.isPending}
        className={`${btn.ghost} w-full`}
      >
        {logout.isPending ? 'Logging out…' : 'Log out'}
      </button>
      {logout.isError && <p data-testid="logout-error" role="alert" className="text-sm font-semibold text-danger">You need a connection to log out. Your data stays on this device until then.</p>}

      <section data-testid="settings-import" className="settings-section settings-import-card">
        <span className="settings-section-icon"><Upload size={19} aria-hidden="true" /></span>
        <div><h2>Bring in past deals</h2><p>Import an Excel or CSV file, review the rows, and undo the import if needed.</p></div>
        <Link to="/import" data-testid="settings-import-link" aria-label="Import deals" className="settings-import-link"><ArrowRight size={19} aria-hidden="true" /></Link>
      </section>

      <SettingsInstallRow />
      <AppearanceSettings />
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
    <section className="settings-danger-zone">
      <h2>Danger zone</h2>
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

function AppearanceSettings() {
  const [mode, setMode] = useState<Appearance>(() => readAppearance())
  const [theme, setTheme] = useState<ColorTheme>(() => readColorTheme())
  const AppearanceHintIcon = mode === 'system' ? Monitor : mode === 'light' ? Sun : Moon
  const hint = mode === 'system' ? 'Following your device appearance.' : mode === 'light' ? 'Light appearance is active.' : 'Dark appearance is active.'
  const themeLabel = theme[0].toUpperCase() + theme.slice(1)
  const changeMode = (next: Appearance) => {
    setMode(next)
    saveAppearance(next)
  }
  const changeTheme = (next: ColorTheme) => {
    setTheme(next)
    saveColorTheme(next)
  }
  return <section data-testid="settings-appearance" className="settings-section">
    <div className="settings-section-heading"><span className="settings-section-icon"><Sun size={19} aria-hidden="true" /></span><div><h2>Appearance</h2><p>Choose how DealBook looks on this device.</p></div></div>
    <SegmentedControl label="appearance" value={mode} onChange={changeMode} options={[
      { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
    ]} />
    <p data-testid="appearance-mode-hint" className="settings-appearance-hint"><AppearanceHintIcon size={15} aria-hidden="true" />{hint}</p>
    <div className="settings-theme-picker">
      <div className="settings-theme-picker-heading"><Palette size={17} aria-hidden="true" /><h3>Color theme</h3></div>
      <div className="settings-theme-options" role="group" aria-label="Color theme">
        {(['indigo', 'sky', 'forest', 'saffron'] as const).map((option) => {
          const selected = theme === option
          const label = option[0].toUpperCase() + option.slice(1)
          return <button
            key={option}
            type="button"
            data-testid={`color-theme-${option}`}
            aria-label={`${label} color theme`}
            aria-pressed={selected}
            onClick={() => changeTheme(option)}
            className={`settings-theme-option ${selected ? 'is-selected' : ''}`}
          >
            <span className="settings-theme-preview" data-theme={option} data-mode="light" aria-hidden="true">
              <span className="settings-theme-brand-swatch" />
              <span className="settings-theme-hero-swatch" />
            </span>
            <span className="settings-theme-option-label">{label}</span>
            {selected && <Check className="settings-theme-check" size={16} aria-hidden="true" />}
          </button>
        })}
      </div>
      <p data-testid="color-theme-hint" className="settings-appearance-hint"><Palette size={15} aria-hidden="true" />{themeLabel} color theme selected.</p>
    </div>
  </section>
}

const ZONES: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['Asia/Kolkata', 'UTC']

function Preferences() {
  const me = useUser()
  const save = useUpdateSettings()
  return (
    <section data-testid="preferences" className="settings-section space-y-4">
      <div className="settings-section-heading"><span className="settings-section-icon"><Clock3 size={19} aria-hidden="true" /></span><div><h2>Preferences</h2><p>Make deadlines work for your day.</p></div></div>
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
