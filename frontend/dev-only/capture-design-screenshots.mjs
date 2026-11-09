/* global document */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

if (process.env.ENV?.trim().toLowerCase() === 'prod' || process.env.NODE_ENV === 'production') {
  console.error('Design screenshot capture is dev-only and cannot run when ENV=prod or NODE_ENV=production.')
  process.exit(1)
}

const baseURL = process.env.DESIGN_CAPTURE_URL || 'http://127.0.0.1:5173'
const outDir = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url))
await mkdir(outDir, { recursive: true })

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const monthDate = (offset, day = 5) => {
  const [year, month] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, day)).toISOString().slice(0, 10)
}
const now = new Date().toISOString()
const mediators = [
  { id: 'mediator-anika', name: 'Anika Sharma', contact: '+91 98765 43210', created_at: now, updated_at: now },
  { id: 'mediator-ravi', name: 'Ravi Kumar', contact: 'tg:@ravi', created_at: now, updated_at: now },
  { id: 'mediator-nisha', name: 'Nisha Patel', contact: null, created_at: now, updated_at: now },
]
function deal(id, product, mediator, date_taken, options = {}) {
  return {
    id, client_id: id, product, platform: options.platform ?? 'Amazon', mediator_id: mediator.id, mediator_name: mediator.name,
    deal_type: 'review', date_taken, amount_paid: options.paid ?? '1499.00', refund_amount: options.refund ?? '1299.00',
    commission: options.commission ?? '100.00', review_deadline: options.reviewDeadline ?? plusDays(today, 5),
    refund_form_deadline: options.formDeadline ?? plusDays(today, 12), review_status: options.review ?? 'pending',
    form_status: options.form ?? 'pending', payment_status: options.payment ?? 'pending',
    payment_received_on: options.receivedOn ?? null, notes: options.notes ?? null, created_at: now, updated_at: now,
  }
}
const deals = [
  deal('deal-baskets', 'Linen storage baskets', mediators[0], monthDate(0), { paid: '1499.00', refund: '1299.00', commission: '100.00', reviewDeadline: plusDays(today, -1), notes: 'Keep the packaging until the review is published.' }),
  deal('deal-keyboard', 'Wireless keyboard', mediators[0], monthDate(-1), { paid: '3499.00', refund: '3200.00', commission: '250.00', review: 'done', formDeadline: plusDays(today, 2) }),
  deal('deal-bottle', 'Insulated water bottle', mediators[1], monthDate(-2), { paid: '899.00', refund: '899.00', review: 'done', form: 'submitted', formDeadline: null }),
  deal('deal-organizers', 'Kitchen organizer set', mediators[2], monthDate(-4), { paid: '2199.00', refund: '2199.00', review: 'done', form: 'submitted', payment: 'received', receivedOn: plusDays(today, -6), formDeadline: null }),
]

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' })
const page = await context.newPage()
await page.route('**/api/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  id: 'demo-user', name: 'Aarav Mehta', email: 'aarav@example.test', avatar_url: null, role: 'user', alert_days: 7, timezone: 'Asia/Kolkata',
}) }))
await page.route('**/api/sync/push', async (route) => {
  const ops = route.request().postDataJSON()?.ops ?? []
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: ops.map(({ op_id }) => ({ op_id, status: 'applied' })) }) })
})
await page.route('**/api/sync/changes*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  server_time: new Date().toISOString(), deals: [], mediators: [], deleted: { deals: [], mediators: [] }, next_cursor: null,
}) }))

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('home-page').waitFor()
  await page.waitForFunction(() => document.querySelector('[data-testid="sync-chip"]')?.getAttribute('data-state') === 'synced')
  await page.evaluate(async ({ deals: dealRows, mediators: mediatorRows }) => {
    const localDb = await import('/src/data/db.ts')
    await localDb.db.mediators.bulkPut(mediatorRows)
    await localDb.db.deals.bulkPut(dealRows)
  }, { deals, mediators })
  await page.getByText('Linen storage baskets').first().waitFor()

  async function shot(targetPage, mode, name) {
    await targetPage.waitForTimeout(280)
    const filename = join(outDir, `${mode}-${name}.png`)
    for (let attempt = 0; ; attempt++) {
      try {
        await targetPage.screenshot({ path: filename })
        break
      } catch (error) {
        if (attempt >= 4) throw error
        await targetPage.waitForTimeout(250 * (attempt + 1))
      }
    }
    const layout = await targetPage.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }))
    console.log(`${mode}-${name}: ${JSON.stringify(layout)}`)
    if (layout.documentWidth > layout.viewportWidth + 1) throw new Error(`${mode}-${name} overflows horizontally: ${JSON.stringify(layout)}`)
  }

  async function capture(mode, name, path, setup) {
    if (path) await page.goto(new URL(path, baseURL).toString(), { waitUntil: 'domcontentloaded' })
    if (setup) await setup()
    if (name === 'home') await page.locator('[data-testid="summary-pending"][data-animation-done="true"]').waitFor()
    await shot(page, mode, name)
  }

  for (const mode of ['light', 'dark']) {
    await page.goto(new URL('/settings', baseURL).toString(), { waitUntil: 'domcontentloaded' })
    await page.getByTestId('settings-appearance').waitFor()
    await page.getByRole('button', { name: mode === 'light' ? 'Light' : 'Dark' }).click()
    await page.waitForFunction((savedMode) => document.documentElement.getAttribute('data-mode') === savedMode, mode)
    await capture(mode, 'home', '/')
    await capture(mode, 'deals', '/deals')
    await capture(mode, 'quick-add', '/deals', async () => {
      await page.getByTestId('nav-add-deal').click()
      await page.getByRole('dialog', { name: 'Quick add deal' }).waitFor()
    })
    await capture(mode, 'deal-detail', '/deals/deal-baskets')
    await capture(mode, 'mediators', '/mediators')
    await capture(mode, 'settings', '/settings')
  }

  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ['/', '/deals', '/deals/deal-baskets', '/mediators', '/settings']) {
      await page.goto(new URL(path, baseURL).toString(), { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.app-frame')
      const layout = await page.evaluate(() => {
        const frame = document.querySelector('.app-frame')?.getBoundingClientRect()
        return { viewportWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth,
          frameWidth: frame?.width, frameLeft: frame?.left }
      })
      if (layout.documentWidth > width + 1) throw new Error(`${width}px ${path} overflows horizontally: ${JSON.stringify(layout)}`)
      if (width >= 768 && (Math.abs((width - 480) / 2 - (layout.frameLeft ?? 0)) > 1 || layout.frameWidth !== 480))
        throw new Error(`${width}px ${path} app frame is not centered at 480px: ${JSON.stringify(layout)}`)
    }
    await page.goto(new URL('/deals', baseURL).toString(), { waitUntil: 'domcontentloaded' })
    await page.getByTestId('nav-add-deal').click()
    await page.getByRole('dialog', { name: 'Quick add deal' }).waitFor()
    const modalWidth = await page.evaluate(() => ({ viewportWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth }))
    if (modalWidth.documentWidth > width + 1) throw new Error(`${width}px quick-add overflows horizontally: ${JSON.stringify(modalWidth)}`)
    console.log(`${width}px layouts: app frame ${Math.min(width, 480)}px; all checked routes fit`)
  }

  for (const mode of ['light', 'dark']) {
    const landingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' })
    await landingContext.addInitScript((savedMode) => {
      globalThis.localStorage.setItem('dealtracker:appearance', savedMode)
      globalThis.localStorage.setItem('dealtracker:color-theme', 'indigo')
    }, mode)
    const landingPage = await landingContext.newPage()
    await landingPage.route('**/api/me', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }))
    await landingPage.goto(new URL('/login', baseURL).toString(), { waitUntil: 'domcontentloaded' })
    await landingPage.getByTestId('login-title').waitFor()
    await landingPage.evaluate(() => document.fonts.ready.then(() => true))
    await landingPage.waitForFunction((savedMode) => document.documentElement.getAttribute('data-mode') === savedMode, mode)
    await shot(landingPage, mode, 'landing')
    for (const width of [360, 1280]) {
      await landingPage.setViewportSize({ width, height: 844 })
      await landingPage.waitForTimeout(180)
      const layout = await landingPage.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }))
      if (layout.documentWidth > layout.viewportWidth + 1) throw new Error(`${mode} landing at ${width}px overflows horizontally`)
    }
    await landingContext.close()
  }
} finally {
  await context.close()
  await browser.close()
}
