import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it } from 'vitest'
import { ToastProvider, useToast } from './Toast'

function Notice() {
  const toast = useToast()
  return <button onClick={() => toast({
    message: 'Your edit to Coffee grinder was replaced by a newer version',
    link: { label: 'View deal', to: '/deals/coffee-grinder' },
  })}>Show notice</button>
}

it('renders the superseded edit notice with a working deal link', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Notice />} />
          <Route path="/deals/:id" element={<p>Deal opened</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Show notice' }))
  expect(screen.getByRole('status').textContent).toContain('Your edit to Coffee grinder was replaced by a newer version')
  fireEvent.click(screen.getByRole('link', { name: 'View deal' }))
  expect(screen.getByText('Deal opened')).toBeTruthy()
})
