import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountButton } from './AccountButton'

afterEach(cleanup)

const avatar = () => <AccountButton name="Asha Rao" url={null} />

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/" element={<p>Home page</p>} />
      <Route path="/deals" element={<><p>Deals page</p>{avatar()}</>} />
      <Route path="/settings" element={<><p>Settings page</p>{avatar()}</>} />
    </Routes>
  </MemoryRouter>)
}

describe('account avatar button', () => {
  it('opens Settings from any page', () => {
    renderAt('/deals')
    fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }))
    expect(screen.getByText('Settings page')).toBeTruthy()
  })

  it('closes Settings again when tapped there', () => {
    renderAt('/deals')
    fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }))
    const close = screen.getByRole('button', { name: 'Close settings' })
    expect(close.getAttribute('aria-current')).toBe('page')
    fireEvent.click(close)
    expect(screen.getByText('Deals page')).toBeTruthy()
  })

  it('falls back to Home when Settings was opened directly', () => {
    renderAt('/settings')
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(screen.getByText('Home page')).toBeTruthy()
  })
})
