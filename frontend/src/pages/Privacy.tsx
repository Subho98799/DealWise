// LEGAL REVIEW REQUIRED: this plain-English template must be reviewed by a qualified lawyer before public launch.
import { Link } from 'react-router-dom'
import { LegalShell } from '../components/LegalShell'
import { APP_NAME, CONTACT_EMAIL } from '../config/app'
import { usePageMeta } from '../lib/pageMeta'

export default function PrivacyPage() {
  usePageMeta({
    title: `Privacy Policy — ${APP_NAME}`,
    description: `How ${APP_NAME} collects, uses and protects your account and deal data.`,
    path: '/privacy',
  })

  return <LegalShell title="Privacy Policy" updated="November 2026">
    <p>{APP_NAME} is a private tracker for review deals, refund forms, mediators and deadlines. This page explains, in plain English, what we collect and what we do with it.</p>

    <section>
      <h2>What we collect</h2>
      <p>When you sign in with Google, we receive your name, email address and profile picture URL. We also store the deals and mediators you add, your alert window and time zone, and a session cookie that keeps you signed in.</p>
      <p>We never receive or store your Google password.</p>
      <p>Your browser also keeps a local copy of your deals and the app shell on your device so the app can open and work offline.</p>
    </section>

    <section>
      <h2>Why we use it</h2>
      <p>We use your data to sign you in, show your deals, sync changes between your devices, remind you about deadlines and respond when you contact us. We do not use it for advertising.</p>
    </section>

    <section>
      <h2>Who can see your data</h2>
      <p>Only the account you sign in with can see your deals and mediators. That rule is enforced in the database with row-level security, so it applies to every query and not just to what the screen shows.</p>
      <p>We do not sell your data and we do not use advertising or analytics trackers. Our service providers process data only to run the app: Vercel hosts the frontend, Render hosts the API, Neon hosts the PostgreSQL database, and Google handles sign-in.</p>
    </section>

    <section>
      <h2>Cookies and local storage</h2>
      <p>We use one session cookie to keep you signed in. It is HttpOnly, SameSite Lax, secure in production, and expires after 30 days of inactivity. We do not cache API responses in the service worker. You can clear local data at any time by logging out or deleting your account.</p>
    </section>

    <section>
      <h2>How long we keep it</h2>
      <p>We keep your account and deal data until you delete them. When you delete your account in Settings, we remove your account, deals and mediators, and your browser clears its local copy.</p>
    </section>

    <section>
      <h2>Your choices</h2>
      <p>You can delete your account and all associated data from Settings at any time. If you have a question about your data, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      <p>Data export is not available today.</p>
    </section>

    <section>
      <h2>Changes to this policy</h2>
      <p>If this policy changes, we will update the date at the top of this page. Continue using <Link to="/">the app</Link> after a change and the updated policy applies.</p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </section>
  </LegalShell>
}
