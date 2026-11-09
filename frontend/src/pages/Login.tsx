import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { CalendarClock, FileSpreadsheet, LockKeyhole, ShieldCheck, Trash2, Wallet, WifiOff } from 'lucide-react'
import { googleLoginHref, useMe } from '../lib/auth'
import { APP_NAME } from '../config/app'
import { LoginInstallLink } from '../components/InstallPrompt'
import { GoogleSignInButton } from '../components/GoogleSignIn'
import { LandingPreview } from '../components/LandingPreview'
import { Card } from '../components/ui'
import { usePageMeta } from '../lib/pageMeta'

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  email_unverified: 'Your Google email is not verified. Verify it with Google and try again.',
  oauth_failed: 'Sign-in could not be completed. Please try again.',
}

const META_DESCRIPTION = 'Every review deal, refund form and deadline in one private place. Sign in with Google, track every mediator and see what is still pending.'

const FEATURES = [
  { icon: CalendarClock, title: 'Never miss a deadline', body: 'Home shows what is due soon and what is already overdue, based on the alert window you choose.' },
  { icon: Wallet, title: 'Every mediator and rupee in one place', body: 'See what each mediator still owes, what you paid, and the net refund on every deal.' },
  { icon: WifiOff, title: 'Works offline, syncs when you are back', body: 'Add and edit deals without a connection. Changes sync to your private account when you reconnect.' },
  { icon: FileSpreadsheet, title: 'Import your old Excel or CSV', body: 'Bring past deals in, review every row before saving, and undo an import if something looks wrong.' },
]

const TRUST = [
  { icon: ShieldCheck, title: 'Only you see your deals', body: 'Every account is scoped in the database itself with row-level security, not just hidden in the screen.' },
  { icon: LockKeyhole, title: 'Sign in with Google only', body: 'There is no password to create, reuse or leak. Google handles the sign-in.' },
  { icon: Trash2, title: 'Delete your account and data any time', body: 'Open Settings and delete your account, deals and mediators in one step.' },
]

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
        <nav aria-label="Landing page">
          <a href="#how-it-works" className="landing-topbar-link">How it works</a>
        </nav>
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

        <section className="landing-problem" aria-labelledby="problem-title">
          <div className="landing-section-inner">
            <p className="landing-eyebrow">The problem</p>
            <h2 id="problem-title" className="landing-statement">
              <span>Forgotten reviews.</span>
              <span>Closed refund forms. Messy Excel.</span>
            </h2>
            <p className="landing-section-copy">
              The order is only half the deal. The money is not really back until the review is done, the form is in, and the refund lands.
            </p>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <div className="landing-section-head">
            <p className="landing-eyebrow">What it does</p>
            <h2 id="features-title" className="landing-heading">Everything between the order and the refund.</h2>
          </div>
          <div className="landing-feature-grid">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="landing-feature">
                <span className="landing-feature-icon" aria-hidden="true"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-how" aria-labelledby="how-title">
          <div className="landing-section-head">
            <p className="landing-eyebrow">How it works</p>
            <h2 id="how-title" className="landing-heading">Three steps, then you are done.</h2>
          </div>
          <ol className="landing-step-list">
            <li>
              <span className="landing-step-number" aria-hidden="true">1</span>
              <h3>Add the deal in 15 seconds</h3>
              <p>Product, mediator, amounts and deadlines. That is all it takes to start tracking.</p>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">2</span>
              <h3>Tick off the review and form</h3>
              <p>One tap when each step is done. The deal timeline shows what comes next.</p>
            </li>
            <li>
              <span className="landing-step-number" aria-hidden="true">3</span>
              <h3>Track the refund until it lands</h3>
              <p>See what is pending with each mediator and mark the money received when it arrives.</p>
            </li>
          </ol>
        </section>

        <section className="landing-trust" aria-labelledby="trust-title">
          <div className="landing-section-inner">
            <p className="landing-eyebrow">Trust</p>
            <h2 id="trust-title" className="landing-heading">Private by design, not by promise.</h2>
            <p className="landing-section-copy">
              Your deals are yours. The rules that keep them private live in the database and in the app.
            </p>
            <ul className="landing-trust-list">
              {TRUST.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <span className="landing-trust-icon" aria-hidden="true"><Icon size={19} /></span>
                  <div><h3>{title}</h3><p>{body}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
