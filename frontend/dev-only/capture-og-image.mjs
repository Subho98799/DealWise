/* global document */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

if (process.env.ENV?.trim().toLowerCase() === 'prod' || process.env.NODE_ENV === 'production') {
  console.error('Social image capture is dev-only and cannot run when ENV=prod or NODE_ENV=production.')
  process.exit(1)
}

const tokens = await readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')
const token = (name) => {
  const value = tokens.match(new RegExp(`${name}:\\s*(#[\\da-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`Missing ${name} in src/styles/tokens.css`)
  return value
}
const logo = await readFile(new URL('../src/assets/dealbook-logo-mark.svg', import.meta.url), 'utf8')
const logoUri = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`
const jakarta = new URL('../node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2', import.meta.url).href
const inter = new URL('../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2', import.meta.url).href
const output = fileURLToPath(new URL('../public/og-cover.png', import.meta.url))

const html = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8" /><style>
  @font-face { font-family: Jakarta; src: url('${jakarta}') format('woff2'); font-weight: 700; }
  @font-face { font-family: Inter; src: url('${inter}') format('woff2'); font-weight: 500; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 1200px; height: 630px; }
  .card {
    position: relative; display: grid; width: 1200px; height: 630px; align-content: space-between;
    overflow: hidden; background: ${token('--color-bg')}; padding: 64px 72px;
  }
  .wash { position: absolute; inset: 0; background: radial-gradient(760px 520px at 88% -8%, ${token('--color-brand-soft')}, transparent 70%); }
  .brand { position: relative; display: flex; align-items: center; gap: 18px; }
  .brand img { width: 76px; height: 76px; }
  .brand-name { font-family: Jakarta, sans-serif; font-size: 44px; font-weight: 700; letter-spacing: -0.03em; color: ${token('--color-ink')}; }
  .body { position: relative; }
  h1 { margin: 0; font-family: Jakarta, sans-serif; font-size: 84px; font-weight: 700; letter-spacing: -0.045em; line-height: 1.02; color: ${token('--color-ink')}; }
  h1 span { color: ${token('--color-brand')}; }
  p { margin: 22px 0 0; font-family: Inter, sans-serif; font-size: 30px; font-weight: 500; color: ${token('--color-muted')}; }
  .footer { position: relative; display: flex; align-items: center; justify-content: space-between; font-family: Inter, sans-serif; font-size: 26px; font-weight: 500; color: ${token('--color-muted')}; }
  .footer b { color: ${token('--color-brand')}; font-weight: 700; }
</style></head><body><div class="card">
  <div class="wash"></div>
  <div class="brand"><img src="${logoUri}" alt="" /><span class="brand-name">DealBook</span></div>
  <div class="body">
    <h1>Every refund.<br />Every deadline.<br /><span>One place.</span></h1>
    <p>Review deal management app · by Vfinite</p>
  </div>
  <div class="footer"><span>dealbook.vfinite.com</span><span><b>Built by Vfinite</b></span></div>
</div></body></html>`

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: output, type: 'png' })
await browser.close()
console.log(`og-cover.png written to ${output}`)
