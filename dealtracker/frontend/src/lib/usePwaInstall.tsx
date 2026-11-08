import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { STORAGE_PREFIX } from '../config/app'

const DISMISSED_UNTIL_KEY = `${STORAGE_PREFIX}pwa-install-dismissed-until`
const DISMISSAL_MS = 14 * 24 * 60 * 60 * 1000
const IN_APP_BROWSER = /instagram|whatsapp|fbav|fban|fb_iab|facebook|gmail/i
const IOS_OTHER_BROWSER = /crios|fxios|edgios|opios|duckduckgo|gsa/i

export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'error'

type PwaInstallValue = {
  canPrompt: boolean
  isInstalled: boolean
  isIOS: boolean
  isIOSSafari: boolean
  isInAppBrowser: boolean
  isDismissed: boolean
  prompt: () => Promise<PwaInstallOutcome>
  dismiss: () => void
  copyPageLink: () => Promise<boolean>
}

const PwaInstallContext = createContext<PwaInstallValue | null>(null)

function readDismissedUntil() {
  try {
    const value = Number(localStorage.getItem(DISMISSED_UNTIL_KEY))
    const now = Date.now()
    return Number.isFinite(value) && value > now && value <= now + DISMISSAL_MS ? value : 0
  } catch {
    return 0
  }
}

function writeDismissedUntil(value: number) {
  try {
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(value))
  } catch {
    // The install prompt remains usable when browser storage is unavailable.
  }
}

function standaloneIsInstalled() {
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return displayMode || navigator.standalone === true
}

function detectIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function detectInAppBrowser() {
  return IN_APP_BROWSER.test(navigator.userAgent)
}

function detectIOSSafari(isIOS: boolean, isInAppBrowser: boolean) {
  return isIOS && !isInAppBrowser && !IOS_OTHER_BROWSER.test(navigator.userAgent) && /safari/i.test(navigator.userAgent)
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const installedByEvent = useRef(false)
  const [canPrompt, setCanPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(standaloneIsInstalled)
  const [dismissedUntil, setDismissedUntil] = useState(readDismissedUntil)
  const isDismissed = dismissedUntil > Date.now()
  const isIOS = detectIOS()
  const isInAppBrowser = detectInAppBrowser()
  const isIOSSafari = detectIOSSafari(isIOS, isInAppBrowser)

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)')
    const updateInstalledState = () => {
      setIsInstalled(displayMode?.matches === true || navigator.standalone === true || installedByEvent.current)
    }
    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault()
      deferredPrompt.current = event
      setCanPrompt(true)
    }
    const onAppInstalled = () => {
      installedByEvent.current = true
      deferredPrompt.current = null
      setCanPrompt(false)
      setIsInstalled(true)
    }

    updateInstalledState()
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    displayMode?.addEventListener?.('change', updateInstalledState)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      displayMode?.removeEventListener?.('change', updateInstalledState)
    }
  }, [])

  useEffect(() => {
    if (!isDismissed) return
    const timer = window.setTimeout(() => {
      setDismissedUntil(0)
      try {
        localStorage.removeItem(DISMISSED_UNTIL_KEY)
      } catch {
        // Expired dismissal state is cleared in memory even when storage is unavailable.
      }
    }, Math.max(0, dismissedUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [dismissedUntil, isDismissed])

  const prompt = useCallback(async (): Promise<PwaInstallOutcome> => {
    const event = deferredPrompt.current
    if (!event) return 'unavailable'
    deferredPrompt.current = null
    setCanPrompt(false)
    try {
      await event.prompt()
      return (await event.userChoice).outcome
    } catch {
      return 'error'
    }
  }, [])

  const dismiss = useCallback(() => {
    const expiresAt = Date.now() + DISMISSAL_MS
    writeDismissedUntil(expiresAt)
    setDismissedUntil(expiresAt)
  }, [])

  const copyPageLink = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href)
        return true
      }
      const input = document.createElement('textarea')
      input.value = window.location.href
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.append(input)
      try {
        input.select()
        return document.execCommand?.('copy') ?? false
      } finally {
        input.remove()
      }
    } catch {
      return false
    }
  }, [])

  const value = useMemo(() => ({
    canPrompt,
    isInstalled,
    isIOS,
    isIOSSafari,
    isInAppBrowser,
    isDismissed,
    prompt,
    dismiss,
    copyPageLink,
  }), [canPrompt, isInstalled, isIOS, isIOSSafari, isInAppBrowser, isDismissed, prompt, dismiss, copyPageLink])

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>
}

export function usePwaInstall() {
  const value = useContext(PwaInstallContext)
  if (!value) throw new Error('usePwaInstall must be used inside PwaInstallProvider')
  return value
}
