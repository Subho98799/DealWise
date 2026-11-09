// LEGAL REVIEW REQUIRED: this plain-English template must be reviewed by a qualified lawyer before public launch.
import { Link } from 'react-router-dom'
import { LegalShell } from '../components/LegalShell'
import { APP_NAME, CONTACT_EMAIL } from '../config/app'
import { usePageMeta } from '../lib/pageMeta'

export default function TermsPage() {
  usePageMeta({
    title: `Terms of Use — ${APP_NAME}`,
    description: `The terms that apply when you use ${APP_NAME} to track review deals and refunds.`,
    path: '/terms',
  })

  return <LegalShell title="Terms of Use" updated="November 2026">
    <p>These terms apply when you use {APP_NAME}. By signing in, you agree to them.</p>

    <section>
      <h2>What the app is</h2>
      <p>{APP_NAME} is a personal tracker for review deals, refund forms, mediators and deadlines. It is not a marketplace, a mediator, a payment provider or a financial adviser. We do not process refunds or hold your money.</p>
    </section>

    <section>
      <h2>Your account</h2>
      <p>You sign in with Google. Keep your Google account secure. You are responsible for activity under your account and for the accuracy of the deals you enter.</p>
    </section>

    <section>
      <h2>Your data</h2>
      <p>You own the deal and mediator information you add. You give us permission to store, display and sync it so we can run the app for you. You can delete your account and data in Settings at any time. See the <Link to="/privacy">Privacy Policy</Link> for details.</p>
    </section>

    <section>
      <h2>Acceptable use</h2>
      <p>Do not try to access another person's data, break the app's security, overload the service, or use it for anything unlawful. Accounts that abuse the service may be suspended or removed.</p>
    </section>

    <section>
      <h2>Availability and changes</h2>
      <p>We work to keep {APP_NAME} available and accurate, but we cannot promise uninterrupted service. The app can open offline after the first load, and changes sync when you reconnect. We may change or stop parts of the service, and we may update these terms. If we do, we will update the date at the top of this page.</p>
    </section>

    <section>
      <h2>Ending use</h2>
      <p>You can stop using the app at any time. Deleting your account removes your account, deals and mediators. We may suspend an account that breaches these terms or creates a security risk.</p>
    </section>

    <section>
      <h2>Liability</h2>
      <p>{APP_NAME} is provided as-is. To the extent permitted by law, we are not liable for indirect or consequential losses, including missed refunds or deadlines caused by incorrect data, device problems or a service interruption. Nothing in these terms limits rights you have under applicable law.</p>
    </section>

    <section>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India. Courts in India have jurisdiction over disputes about them.</p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </section>
  </LegalShell>
}
