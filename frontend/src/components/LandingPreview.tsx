import { APP_NAME } from '../config/app'

export function LandingPreview() {
  return <div className="landing-preview" role="img" aria-label={`Preview of the ${APP_NAME} Home screen with sample deals.`}>
    <div className="landing-phone" aria-hidden="true">
      <div className="landing-phone-screen">
        <div className="landing-phone-status"><span>9:41</span><span className="landing-phone-sensors" /></div>
        <div className="landing-phone-appbar">
          <span className="landing-phone-brand"><span className="landing-phone-mark" />{APP_NAME}</span>
          <span className="landing-phone-avatar">AM</span>
        </div>
        <div className="landing-phone-body">
          <p className="landing-phone-eyebrow">Your deals, at a glance</p>
          <p className="landing-phone-welcome">Welcome back, Aarav</p>
          <div className="landing-phone-hero">
            <div className="landing-phone-hero-row">
              <div>
                <p className="landing-phone-hero-label">Refund pending</p>
                <p className="landing-phone-amount money">₹12,450</p>
              </div>
              <span className="landing-phone-hero-mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 9.5h7M8.5 13h7M12 9.5v5.5" strokeLinecap="round" />
                </svg>
              </span>
            </div>
            <div className="landing-phone-track"><span style={{ width: '64%' }} /></div>
            <div className="landing-phone-track-labels"><span>₹22,300 received</span><span>₹12,450 pending</span></div>
            <div className="landing-phone-deadline"><span>1 deal needs attention</span><span aria-hidden="true">→</span></div>
          </div>
          <div className="landing-phone-deal is-warning">
            <div className="landing-phone-deal-top">
              <span>Noise-cancelling headphones</span>
              <b className="money">₹3,200</b>
            </div>
            <p>Anika Sharma · review due in 2 days</p>
            <div className="landing-phone-steps"><i className="is-done" /><i /><i /></div>
            <span className="landing-phone-chip is-warning">2 days left</span>
          </div>
          <div className="landing-phone-deal is-success">
            <div className="landing-phone-deal-top">
              <span>Robot vacuum cleaner</span>
              <b className="money">₹2,499</b>
            </div>
            <p>Ravi Kumar · refund form submitted</p>
            <div className="landing-phone-steps"><i className="is-done" /><i className="is-done" /><i /></div>
            <span className="landing-phone-chip is-success">Review done</span>
          </div>
        </div>
      </div>
    </div>
    <p className="landing-preview-caption">Sample Home screen with example deals.</p>
  </div>
}
