import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { googleLoginHref, useMe } from '../lib/auth'
import { APP_NAME } from '../config/app'
import { LoginInstallLink } from '../components/InstallPrompt'

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  email_unverified: 'Your Google email is not verified. Verify it with Google and try again.',
  oauth_failed: 'Sign-in could not be completed. Please try again.',
}

export default function LoginPage() {
  const me = useMe()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = (location.state as { next?: string } | null)?.next ?? '/'
  const error = params.get('error')

  if (me.isSuccess) return <Navigate to={next} replace />

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-gutter">
      <div className="flex flex-1 flex-col justify-end pb-10">
        <div className="rise mb-8 grid h-16 w-16 place-items-center rounded-lg bg-primary shadow-card">
          <span className="h-8 w-8 rounded-pill border-[5px] border-primary-ink" />
        </div>
        <h1 data-testid="login-title" className="rise text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ animationDelay: '60ms' }}>
          {APP_NAME}
        </h1>
        <p data-testid="login-tagline" className="rise mt-3 text-base text-muted" style={{ animationDelay: '120ms' }}>
          Every review deal, refund and deadline in one place, so no rupee slips through.
        </p>
      </div>

      <div className="rise pb-10" style={{ animationDelay: '180ms' }}>
        {error && (
          <p data-testid="login-error" role="alert" className="mb-4 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {ERRORS[error] ?? ERRORS.oauth_failed}
          </p>
        )}
        <a
          data-testid="login-google-button"
          href={googleLoginHref(next)}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-pill bg-ink text-base font-bold text-bg shadow-card transition-transform active:scale-[0.98]"
        >
          <GoogleMark />
          Continue with Google
        </a>
        <LoginInstallLink />
        <p className="mt-4 text-center text-xs text-muted">Your deals are private to your account.</p>
      </div>
    </div>
  )
}

function GoogleMark() {
  return <span className="font-display text-lg font-bold text-primary" aria-hidden="true">G</span>
}
