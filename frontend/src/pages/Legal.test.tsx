import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import PrivacyPage from './Privacy'
import TermsPage from './Terms'
import { CONTACT_EMAIL } from '../config/app'

afterEach(cleanup)

describe('legal pages', () => {
  it('renders the privacy policy with one heading and the contact address', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy()
    expect(screen.getByText(/row-level security/i)).toBeTruthy()
    expect(screen.getAllByText(CONTACT_EMAIL).length).toBeGreaterThan(0)
    expect(document.title).toContain('Privacy Policy')
  })

  it('renders the terms with one heading', () => {
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeTruthy()
    expect(screen.getByText(/not a marketplace/i)).toBeTruthy()
    expect(document.title).toContain('Terms of Use')
  })
})
