import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './Login'
import { googleLoginHref, useMe } from '../lib/auth'
import { usePwaInstall } from '../lib/usePwaInstall'
import { CONTACT_EMAIL } from '../config/app'

vi.mock('../lib/auth', () => ({
  useMe: vi.fn(),
  googleLoginHref: (next = '/') => `/api/auth/google/login?next=${encodeURIComponent(next)}`,
}))

vi.mock('../lib/usePwaInstall', () => ({ usePwaInstall: vi.fn() }))

const useMeMock = vi.mocked(useMe)
const usePwaInstallMock = vi.mocked(usePwaInstall)

function installState(overrides: Partial<ReturnType<typeof usePwaInstall>> = {}) {
  const value = {
    canPrompt: false,
    isInstalled: false,
    isIOS: false,
    isIOSSafari: false,
    isInAppBrowser: false,
    isDismissed: false,
    prompt: vi.fn().mockResolvedValue('accepted'),
    dismiss: vi.fn(),
    copyPageLink: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  usePwaInstallMock.mockReturnValue(value)
  return value
}

function renderLogin(path = '/login', state?: unknown) {
  const entry = state ? { pathname: path, state } : path
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div data-testid="home-route">Home</div>} />
        <Route path="/deals" element={<div data-testid="deals-route">Deals</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Login landing page', () => {
  beforeEach(() => {
    useMeMock.mockReturnValue({ isSuccess: false } as ReturnType<typeof useMe>)
    installState()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the landing page to a logged-out visitor', () => {
    renderLogin()
    expect(screen.getByTestId('login-title').textContent).toContain('Every refund.')
    expect(screen.getByTestId('login-google-button').getAttribute('href')).toBe(googleLoginHref('/'))
    expect(screen.getByTestId('login-install-link')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy')
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms')
    expect(screen.getByRole('link', { name: CONTACT_EMAIL }).getAttribute('href')).toBe(`mailto:${CONTACT_EMAIL}`)
  })

  it('redirects a logged-in user to Home', () => {
    useMeMock.mockReturnValue({ isSuccess: true } as ReturnType<typeof useMe>)
    renderLogin()
    expect(screen.getByTestId('home-route')).toBeTruthy()
    expect(screen.queryByTestId('login-title')).toBeNull()
  })

  it('keeps the requested path after a logged-in redirect', () => {
    useMeMock.mockReturnValue({ isSuccess: true } as ReturnType<typeof useMe>)
    renderLogin('/login', { next: '/deals' })
    expect(screen.getByTestId('deals-route')).toBeTruthy()
  })

  it('rejects an external return destination from navigation state', () => {
    useMeMock.mockReturnValue({ isSuccess: true } as ReturnType<typeof useMe>)
    renderLogin('/login', { next: '//evil.example/path' })
    expect(screen.getByTestId('home-route')).toBeTruthy()
  })

  it('hides the install link when the app is already installed', () => {
    installState({ isInstalled: true })
    renderLogin()
    expect(screen.queryByTestId('login-install-link')).toBeNull()
  })

  it('opens the native install prompt from the install link', async () => {
    const install = installState({ canPrompt: true })
    renderLogin()
    fireEvent.click(screen.getByTestId('login-install-link'))
    await waitFor(() => expect(install.prompt).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows manual install steps when the browser cannot prompt', () => {
    installState({ canPrompt: false })
    renderLogin()
    fireEvent.click(screen.getByTestId('login-install-link'))
    expect(screen.getByRole('dialog', { name: 'Install DealBook' })).toBeTruthy()
    expect(screen.getByText(/Open the browser menu/i)).toBeTruthy()
  })
})
