import { expect, test } from '@playwright/test'
import { cleanup, createUser, serverDeals, useSession } from './helpers'

test.afterAll(cleanup)

const chip = (page: import('@playwright/test').Page) => page.getByTestId('sync-chip')

test('add a deal while offline, then it syncs after reconnecting', async ({ page, context, baseURL }) => {
  const u = await createUser('Offline Olivia')
  await useSession(context, baseURL!, u.token)
  await page.goto('/deals/new')
  await expect(chip(page)).toHaveAttribute('data-state', 'synced')

  await context.setOffline(true)
  await page.getByTestId('deal-product-input').fill('Offline mixer')
  await page.getByTestId('deal-mediator-input').fill('Ravi')
  await page.getByTestId('deal-amount-paid-input').fill('1299')
  await page.getByTestId('deal-refund-input').fill('1299.50')
  await page.getByTestId('deal-save-button').click()
  await expect(page.getByTestId('deal-saved')).toBeVisible() // no spinner, no network wait
  await expect(chip(page)).toHaveAttribute('data-state', 'offline')
  await page.getByTestId('saved-done-button').click()
  await expect(page.getByTestId('deal-card-product')).toHaveText('Offline mixer')
  expect(await serverDeals(u.id)).toEqual([])

  await context.setOffline(false)
  await expect(chip(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 })
  expect((await serverDeals(u.id)).map((d) => d.product)).toEqual(['Offline mixer'])
})

test('one-tap actions with undo', async ({ page, context, baseURL }) => {
  const u = await createUser('Tap Tara')
  await useSession(context, baseURL!, u.token)
  await page.goto('/deals/new')
  await page.getByTestId('deal-product-input').fill('Tap phone case')
  await page.getByTestId('deal-save-button').click()
  await page.getByTestId('saved-done-button').click()

  const action = page.getByTestId('deal-card-action-button')
  await expect(action).toHaveText('Review done')
  await action.click()
  await expect(action).toHaveText('Form submitted')
  await page.getByTestId('toast-action-button').click() // Undo
  await expect(action).toHaveText('Review done')
  await action.click()
  await expect(action).toHaveText('Form submitted')
  await expect(chip(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 })
  await expect.poll(async () => (await serverDeals(u.id))[0]?.review_status).toBe('done')
})

test('two accounts on one browser never see each other\'s data', async ({ page, context, baseURL }) => {
  const a = await createUser('Alice A')
  const b = await createUser('Bob B')
  await useSession(context, baseURL!, a.token)
  await page.goto('/deals/new')
  await page.getByTestId('deal-product-input').fill('Alice secret deal')
  await page.getByTestId('deal-save-button').click()
  await expect(chip(page)).toHaveAttribute('data-state', 'synced', { timeout: 30_000 })

  // 1) account switch without logout (cookie replaced): the local store must be wiped
  await useSession(context, baseURL!, b.token)
  await page.goto('/deals')
  await expect(page.getByTestId('deals-empty')).toBeVisible()
  await expect(page.getByText('Alice secret deal')).toHaveCount(0)

  // 2) logout wipes local data completely
  await page.goto('/settings')
  await page.getByTestId('logout-button').click()
  await page.waitForURL('**/login')
  const leftovers = await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    return { dbs: dbs.map((d) => d.name), keys: Object.keys(localStorage).filter((k) => k.startsWith('dealtracker:')) }
  })
  expect(leftovers.keys).toEqual([])
  expect(leftovers.dbs.filter(Boolean).length).toBeLessThanOrEqual(1) // a fresh empty store may be re-created

  // 3) Alice logs back in and sees only her own deal
  await useSession(context, baseURL!, a.token)
  await page.goto('/deals')
  await expect(page.getByText('Alice secret deal')).toBeVisible({ timeout: 30_000 })
})
