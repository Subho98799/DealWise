import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { googleLoginHref, useMe } from '../lib/auth'
import { APP_NAME } from '../config/app'
import { LoginInstallLink } from '../components/InstallPrompt'
import { GoogleSignInButton } from '../components/GoogleSignIn'
import { LandingPreview } from '../components/LandingPreview'
import { usePageMeta } from '../lib/pageMeta'

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  email_unverified: 'Your Google email is not verified. Verify it with Google and try again.',
  oauth_failed: 'Sign-in could not be completed. Please try again.',
}

const META_DESCRIPTION = 'Every review deal, refund form and deadline in one private place. Sign in with Google, track every mediator and see what is still pending.'

export default function LoginPage() {
  const me = useMe()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = (location.state as { next?: string } | null)?.next ?? '/'
  const error = params.get('error')

  usePageMeta({ title: `${APP_NAME} — Every refund. Every deadline. One place.`, description: META_DESCRIPTION, path: '/' })

  if (me.isSuccess) return <Navigate to={next} replace />

  return (
    <div className="landing-page">
      <header className="landing-topbar landing-shell">
        <Link to="/login" className="landing-brand" aria-label={`${APP_NAME} home`}>
          <span className="landing-logo" aria-hidden="true"><span /></span>
          <span>{APP_NAME}</span>
        </Link>
      </header>

      <main className="landing-shell">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Built for review deals</p>
            <h1 id="landing-title" data-testid="login-title" className="landing-title">
              Every refund.<br />Every deadline.<br /><span className="landing-title-accent">One place.</span>
            </h1>
            <p data-testid="login-tagline" className="landing-subhead">
              Track every review deal, refund form and mediator payment, so no rupee slips through.
            </p>

            {error && (
              <p data-testid="login-error" role="alert" className="landing-error">
                {ERRORS[error] ?? ERRORS.oauth_failed}
              </p>
            )}

            <div className="landing-actions">
              <GoogleSignInButton href={googleLoginHref(next)} testId="login-google-button" />
              <LoginInstallLink />
            </div>
            <p className="landing-fineprint">Sign in with Google. No password needed.</p>
          </div>

          <LandingPreview />
        </section>
      </main>
    </div>
  )
}
