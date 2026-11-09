import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME, CONTACT_EMAIL } from '../config/app'

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return <div className="legal-page">
    <header className="legal-topbar landing-shell">
      <Link to="/login" className="landing-brand" aria-label={`${APP_NAME} home`}>
        <span className="landing-logo" aria-hidden="true"><span /></span>
        <span>{APP_NAME}</span>
      </Link>
      <Link to="/login" className="legal-back">Back to sign in</Link>
    </header>
    <main className="legal-main landing-shell">
      <article className="legal-article">
        <p className="landing-eyebrow">Legal</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        {children}
      </article>
    </main>
    <footer className="legal-footer">
      <div className="legal-footer-inner landing-shell">
        <p>© {new Date().getFullYear()} {APP_NAME}</p>
        <nav aria-label="Legal and contact" className="landing-footer-nav">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
      </div>
    </footer>
  </div>
}
