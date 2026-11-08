import type { PropsWithChildren } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaInstallProvider, usePwaInstall, type PwaInstallOutcome } from './usePwaInstall'

const wrapper = ({ children }: PropsWithChildren) => <PwaInstallProvider>{children}</PwaInstallProvider>
const fourteenDays = 14 * 24 * 60 * 60 * 1000

function setUserAgent(userAgent: string, platform = '') {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent })
  Object.defineProperty(navigator, 'platform', { configurable: true, value: platform })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
}

function setDisplayMode(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  })
}

function installEvent(outcome: 'accepted' | 'dismissed', prompt = vi.fn().mockResolvedValue(undefined)) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) })
  return { event, prompt }
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    localStorage.clear()
    setUserAgent('Mozilla/5.0')
    setDisplayMode(false)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it.each(['accepted', 'dismissed'] as const)('captures the native prompt and reports %s', async (outcome) => {
    const { event, prompt } = installEvent(outcome)
    const { result } = renderHook(() => usePwaInstall(), { wrapper })

    act(() => window.dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(result.current.canPrompt).toBe(true)

    let resultOutcome: PwaInstallOutcome = 'unavailable'
    await act(async () => { resultOutcome = await result.current.prompt() })

    expect(prompt).toHaveBeenCalledOnce()
    expect(resultOutcome).toBe(outcome)
    expect(result.current.canPrompt).toBe(false)
  })

  it('reports an error when the browser prompt rejects', async () => {
    const { event } = installEvent('accepted', vi.fn().mockRejectedValue(new Error('blocked')))
    const { result } = renderHook(() => usePwaInstall(), { wrapper })
    act(() => window.dispatchEvent(event))

    await act(async () => expect(await result.current.prompt()).toBe('error'))
  })

  it('detects standalone mode and the appinstalled event, not local storage', () => {
    localStorage.setItem('dealtracker:pwa-installed', 'true')
    const { result, unmount } = renderHook(() => usePwaInstall(), { wrapper })
    expect(result.current.isInstalled).toBe(false)
    unmount()

    setDisplayMode(true)
    const standalone = renderHook(() => usePwaInstall(), { wrapper })
    expect(standalone.result.current.isInstalled).toBe(true)
    standalone.unmount()

    setDisplayMode(false)
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    const iosStandalone = renderHook(() => usePwaInstall(), { wrapper })
    expect(iosStandalone.result.current.isInstalled).toBe(true)
    iosStandalone.unmount()

    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
    const installed = renderHook(() => usePwaInstall(), { wrapper })
    act(() => window.dispatchEvent(new Event('appinstalled')))
    expect(installed.result.current.isInstalled).toBe(true)
  })

  it('detects iOS Safari and common in-app browsers', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
    const safari = renderHook(() => usePwaInstall(), { wrapper })
    expect(safari.result.current.isIOS).toBe(true)
    expect(safari.result.current.isIOSSafari).toBe(true)
    expect(safari.result.current.isInAppBrowser).toBe(false)
    safari.unmount()

    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Instagram')
    const instagram = renderHook(() => usePwaInstall(), { wrapper })
    expect(instagram.result.current.isIOS).toBe(true)
    expect(instagram.result.current.isInAppBrowser).toBe(true)
    expect(instagram.result.current.isIOSSafari).toBe(false)
  })

  it.each(['WhatsApp', 'FBAN/FBAV', 'Gmail'])('recognizes the %s in-app browser', (browser) => {
    setUserAgent(`Mozilla/5.0 Android ${browser}`)
    const { result } = renderHook(() => usePwaInstall(), { wrapper })
    expect(result.current.isInAppBrowser).toBe(true)
  })

  it('remembers dismissal for 14 days and then expires it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T00:00:00Z'))
    const { result } = renderHook(() => usePwaInstall(), { wrapper })
    expect(result.current.isDismissed).toBe(false)

    act(() => result.current.dismiss())
    expect(result.current.isDismissed).toBe(true)
    expect(Number(localStorage.getItem('dealtracker:pwa-install-dismissed-until'))).toBe(Date.now() + fourteenDays)

    act(() => vi.advanceTimersByTime(fourteenDays))
    expect(result.current.isDismissed).toBe(false)
  })
})
