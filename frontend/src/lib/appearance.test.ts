import { beforeEach, describe, expect, it } from 'vitest'
import { applyAppearance, readAppearance, readColorTheme, saveAppearance, saveColorTheme } from './appearance'

describe('appearance preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-mode')
  })

  it('persists the selected color theme and mode on this device', () => {
    saveColorTheme('forest')
    saveAppearance('dark')

    expect(localStorage.getItem('dealtracker:color-theme')).toBe('forest')
    expect(localStorage.getItem('dealtracker:appearance')).toBe('dark')

    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-mode')
    applyAppearance(readAppearance(), readColorTheme())

    expect(document.documentElement.getAttribute('data-theme')).toBe('forest')
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark')
  })

  it('defaults to Indigo and System when stored values are missing or invalid', () => {
    localStorage.setItem('dealtracker:color-theme', 'violet')
    localStorage.setItem('dealtracker:appearance', 'sepia')

    expect(readColorTheme()).toBe('indigo')
    expect(readAppearance()).toBe('system')
    applyAppearance(readAppearance(), readColorTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('indigo')
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false)
  })
})
