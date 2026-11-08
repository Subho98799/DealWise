import { STORAGE_PREFIX } from '../config/app'

export type Appearance = 'system' | 'light' | 'dark'
export type ColorTheme = 'indigo' | 'forest' | 'saffron'

const APPEARANCE_KEY = `${STORAGE_PREFIX}appearance`
const COLOR_THEME_KEY = `${STORAGE_PREFIX}color-theme`
const THEMES: ColorTheme[] = ['indigo', 'forest', 'saffron']

function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function saveStoredValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Keep the current page usable when browser storage is unavailable.
  }
}

export function readAppearance(): Appearance {
  const saved = readStoredValue(APPEARANCE_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

export function readColorTheme(): ColorTheme {
  const saved = readStoredValue(COLOR_THEME_KEY)
  return THEMES.includes(saved as ColorTheme) ? saved as ColorTheme : 'indigo'
}

export function applyAppearance(mode: Appearance, theme: ColorTheme = readColorTheme()) {
  const root = document.documentElement
  root.setAttribute('data-theme', THEMES.includes(theme) ? theme : 'indigo')
  if (mode === 'system') root.removeAttribute('data-mode')
  else root.setAttribute('data-mode', mode === 'dark' ? 'dark' : 'light')
}

export function saveAppearance(mode: Appearance) {
  saveStoredValue(APPEARANCE_KEY, mode)
  applyAppearance(mode, readColorTheme())
}

export function saveColorTheme(theme: ColorTheme) {
  const next = THEMES.includes(theme) ? theme : 'indigo'
  saveStoredValue(COLOR_THEME_KEY, next)
  applyAppearance(readAppearance(), next)
}
