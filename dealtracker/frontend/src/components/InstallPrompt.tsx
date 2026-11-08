import { useEffect, useState } from 'react'

const ANDROID_DISMISSED = 'dt_install_dismissed'
const IOS_HINT_SEEN = 'dt_ios_hint_seen'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

function isIosSafari() {
  const ua = navigator.userAgent
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const otherBrowser = /crios|fxios|edgios|opios/i.test(ua)
  return ios && !otherBrowser && /safari/i.test(ua)
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIos, setShowIos] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      if (localStorage.getItem(ANDROID_DISMISSED)) return
      setDeferred(e)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (isIosSafari() && !localStorage.getItem(IOS_HINT_SEEN)) setShowIos(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismissAndroid = () => {
    localStorage.setItem(ANDROID_DISMISSED, '1')
    setDeferred(null)
  }
  const dismissIos = () => {
    localStorage.setItem(IOS_HINT_SEEN, '1')
    setShowIos(false)
  }
  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  if (deferred) {
    return (
      <Banner testId="install-banner" onClose={dismissAndroid}>
        <p className="flex-1 text-sm font-semibold">Install DealTracker for one-tap access.</p>
        <button
          data-testid="install-banner-install-button"
          onClick={install}
          className="rounded-pill bg-primary px-4 py-2 text-sm font-bold text-primary-ink transition-transform active:scale-95"
        >
          Install app
        </button>
      </Banner>
    )
  }
  if (showIos) {
    return (
      <Banner testId="ios-install-hint" onClose={dismissIos}>
        <p className="flex-1 text-sm">
          <span className="font-semibold">Add to your iPhone:</span> tap <ShareIcon /> <b>Share</b>, then{' '}
          <b>Add to Home Screen</b>.
        </p>
      </Banner>
    )
  }
  return null
}

function Banner({ children, onClose, testId }: { children: React.ReactNode; onClose: () => void; testId: string }) {
  return (
    <div
      data-testid={testId}
      role="status"
      className="rise fixed inset-x-3 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+12px)] z-30 mx-auto flex max-w-md items-center gap-3 rounded-md border border-line bg-surface p-3 pl-4 shadow-card"
    >
      {children}
      <button
        data-testid={`${testId}-dismiss-button`}
        onClick={onClose}
        aria-label="Dismiss"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-pill text-muted transition-colors hover:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg className="inline -mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Share icon">
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
