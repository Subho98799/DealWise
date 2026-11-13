import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { CalendarClock, Check, FileSpreadsheet, LockKeyhole, ShieldCheck, Sparkles, Trash2, Wallet, WifiOff } from 'lucide-react'
import { googleLoginHref, useMe } from '../lib/auth'
import { safeReturnPath } from '../lib/returnPath'
import { APP_NAME, CONTACT_EMAIL } from '../config/app'
import { LoginInstallLink } from '../components/InstallPrompt'
import { GoogleSignInButton } from '../components/GoogleSignIn'
import { LandingPreview } from '../components/LandingPreview'
import { LogoMark } from '../components/LogoMark'
import { usePageMeta } from '../lib/pageMeta'

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  email_unverified: 'Your Google email is not verified. Verify it with Google and try again.',
  oauth_failed: 'Sign-in could not be completed. Please try again.',
}

const META_DESCRIPTION = 'Every review deal, refund form and deadline in one private place. Sign in with Google, track every mediator and see what is still pending.'

const FEATURES = [
  { icon: CalendarClock, title: 'Deadlines on time', body: 'Due-soon and overdue deals, based on the alert window you pick.' },
  { icon: Wallet, title: 'Every rupee back', body: 'Net refund per mediator, with what is paid, pending and received.' },
  { icon: WifiOff, title: 'Works offline', body: 'Add and edit without a signal. Changes sync when you return.' },
  { icon: FileSpreadsheet, title: 'Bring your sheet', body: 'Import Excel or CSV, review each row, undo if it looks wrong.' },
]

const ASSURANCES = ['Private to your account', 'Works offline', 'Installs on your phone']

const TRUST = [
  { icon: ShieldCheck, title: 'Only you see your deals', body: 'Row-level security scopes every database query to your account.' },
  { icon: LockKeyhole, title: 'Google sign-in only', body: 'No password to create, reuse or leak.' },
  { icon: Trash2, title: 'Delete any time', body: 'Remove your account, deals and mediators in one step.' },
]

export default function LoginPage() {
  const me = useMe()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = safeReturnPath((location.state as { next?: unknown } | null)?.next)
  const error = params.get('error')

  usePageMeta({ title: `${APP_NAME} — Every refund. Every deadline. One place.`, description: META_DESCRIPTION, path: '/' })

  if (me.isSuccess) return <Navigate to={next} replace />

  return (
    <div className="landing-page">
      <header className="landing-topbar landing-shell">
        <Link to="/login" className="landing-brand" aria-label={`${APP_NAME} home`}>
          <LogoMark size={34} className="landing-logo-img" />
          <span>{APP_NAME}</span>
        </Link>
        <nav aria-label="Landing page">
          <a href="#features" className="landing-topbar-link">What you get</a>
        </nav>
      </header>

      <main className="landing-shell">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-badge"><Sparkles size={14} aria-hidden="true" />Built for review deals</p>
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

            <ul className="landing-assurances" aria-label="What you get">
              {ASSURANCES.map((item) => (
                <li key={item}><Check size={14} aria-hidden="true" />{item}</li>
              ))}
            </ul>
          </div>

          <LandingPreview />
        </section>

        <section id="features" className="landing-features" aria-labelledby="features-title">
          <div className="landing-section-head">
            <p className="landing-eyebrow">What you get</p>
            <h2 id="features-title" className="landing-heading">From order to refund, without the spreadsheet.</h2>
          </div>
          <div className="landing-feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="landing-feature">
                <span className="landing-feature-icon" aria-hidden="true"><Icon size={18} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-private" aria-labelledby="private-title">
          <div className="landing-private-copy">
            <p className="landing-eyebrow">Private by design</p>
            <h2 id="private-title" className="landing-heading">Your deals stay yours.</h2>
            <p>The rules that keep your data private live in the database and in the app, not in a promise.</p>
          </div>
          <ul className="landing-private-list">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <span className="landing-private-icon" aria-hidden="true"><Icon size={17} /></span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner landing-shell">
          <div className="landing-footer-brand">
            <LogoMark size={28} className="landing-logo-img" />
            <span>{APP_NAME}</span>
          </div>
          <nav aria-label="Legal and contact" className="landing-footer-nav">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </nav>
          <p className="landing-footer-copy">© {new Date().getFullYear()} {APP_NAME}. Built for review deals in India.</p>
        </div>
      </footer>
    </div>
  )
}
