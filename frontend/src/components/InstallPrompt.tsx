import { useState } from 'react'
import { ArrowRight, Check, Download, X } from 'lucide-react'
import { APP_NAME } from '../config/app'
import { usePwaInstall } from '../lib/usePwaInstall'
import { Sheet } from './ui'

type InstallControlVariant = 'home' | 'settings' | 'login'
type ManualFlow = 'ios' | 'in-app' | 'menu'

export function HomeInstallBanner() {
  const { isInstalled, isDismissed, dismiss } = usePwaInstall()
  if (isInstalled || isDismissed) return null

  return <aside data-testid="home-install-banner" className="home-install-banner">
    <div className="home-install-copy">
      <span className="home-install-icon" aria-hidden="true"><Download size={19} /></span>
      <p>Install {APP_NAME} on your phone</p>
    </div>
    <InstallAppControl variant="home" />
    <button type="button" data-testid="home-install-dismiss" aria-label="Dismiss install suggestion" onClick={dismiss} className="home-install-dismiss">
      <X size={18} aria-hidden="true" />
    </button>
  </aside>
}

export function SettingsInstallRow() {
  const { isInstalled } = usePwaInstall()
  if (isInstalled) {
    return <div data-testid="settings-installed-row" className="settings-install-row is-installed" role="status">
      <span className="settings-install-icon" aria-hidden="true"><Check size={19} /></span>
      <span className="settings-install-label">Installed</span>
    </div>
  }
  return <InstallAppControl variant="settings" />
}

export function LoginInstallLink() {
  const { isInstalled } = usePwaInstall()
  return isInstalled ? null : <InstallAppControl variant="login" />
}

function InstallAppControl({ variant }: { variant: InstallControlVariant }) {
  const install = usePwaInstall()
  const [flow, setFlow] = useState<ManualFlow | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const openManualFlow = () => {
    setOutcome(null)
    setCopyMessage(null)
    if (install.isInAppBrowser) setFlow('in-app')
    else if (install.isIOS) setFlow('ios')
    else setFlow('menu')
  }

  const handleInstall = async () => {
    if (install.isInAppBrowser || install.isIOS || !install.canPrompt) {
      openManualFlow()
      return
    }
    const result = await install.prompt()
    if (result === 'unavailable' || result === 'error') {
      setOutcome(result === 'error' ? 'Your browser could not open the install prompt. Try the menu steps.' : null)
      setFlow('menu')
      return
    }
    setOutcome(result === 'accepted' ? 'Install request accepted.' : 'Install was cancelled. You can add it later from the browser menu.')
  }

  const handleCopyLink = async () => {
    setCopyMessage(await install.copyPageLink() ? 'Link copied.' : 'Could not copy the link. Copy it from your browser address bar.')
  }

  const button = variant === 'home'
    ? <button type="button" data-testid="home-install-button" onClick={() => void handleInstall()} className="home-install-button">Install</button>
    : variant === 'settings'
      ? <button type="button" data-testid="settings-install-button" onClick={() => void handleInstall()} className="settings-install-row">
        <span className="settings-install-icon" aria-hidden="true"><Download size={19} /></span>
        <span className="settings-install-label">Install app</span>
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      : <button type="button" data-testid="login-install-link" onClick={() => void handleInstall()} className="login-install-link">Install app</button>

  const title = flow === 'in-app' ? 'Open in your browser to install' : flow === 'ios' ? 'Add to Home Screen' : `Install ${APP_NAME}`

  return <>
    {button}
    {outcome && <p data-testid={`${variant}-install-outcome`} className="install-outcome" role="status">{outcome}</p>}
    <Sheet open={flow !== null} title={title} onClose={() => setFlow(null)} closeTestId={`${variant}-install-sheet-close`}>
      {flow === 'in-app' ? <div className="install-sheet-content">
        <p>Open this page in Safari (or Chrome) to install {APP_NAME}.</p>
        <button type="button" data-testid={`${variant}-copy-install-link`} onClick={() => void handleCopyLink()} className="install-copy-button">Copy link</button>
        {copyMessage && <p data-testid="install-copy-result" role="status">{copyMessage}</p>}
      </div> : flow === 'ios' ? <div className="install-sheet-content">
        <p>Follow these steps on your iPhone:</p>
        <ol className="install-steps">
          <li><span className="install-step-number">1</span><span>Tap <ShareIcon /> Share.</span></li>
          <li><span className="install-step-number">2</span><span>Choose <b>Add to Home Screen</b>.</span></li>
          <li><span className="install-step-number">3</span><span>Tap <b>Add</b>.</span></li>
        </ol>
      </div> : flow === 'menu' ? <div className="install-sheet-content">
        <p>Your browser can add {APP_NAME} from its menu:</p>
        <ol className="install-steps">
          <li><span className="install-step-number">1</span><span>Open the browser menu.</span></li>
          <li><span className="install-step-number">2</span><span>Tap <b>Install</b> or <b>Add to Home screen</b>.</span></li>
        </ol>
        {outcome && <p role="status">{outcome}</p>}
      </div> : null}
    </Sheet>
  </>
}

function ShareIcon() {
  return <svg className="install-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 15V3m-5 5 5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
