import { defineConfig, devices } from '@playwright/test'

// Needs a running backend (on a TEST database) and `yarn build && yarn preview`. See docs/IMPLEMENTATION.md "Testing".
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
    serviceWorkers: 'block',
    ...devices['Pixel 7'],
  },
})
