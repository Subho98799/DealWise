import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_SLUG } from './src/config/app'
import { BRAND_NAME, SEO_IMAGE_URL, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_TITLE, SITE_URL, SOCIAL_IMAGE, siteJsonLd } from './src/config/seo'

const designTokens = readFileSync(new URL('./src/styles/tokens.css', import.meta.url), 'utf8')
function token(name: string) {
  const value = designTokens.match(new RegExp(`${name}:\\s*(#[\\da-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`Missing ${name} in src/styles/tokens.css`)
  return value
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [
      react(),
      {
        name: 'site-html',
        transformIndexHtml: {
          order: 'pre',
          handler: (html: string) => {
          const jsonLd = JSON.stringify(siteJsonLd()).replace(/</g, '\\u003c')
          const tokens: Record<string, string> = {
            '%APP_NAME%': APP_NAME,
            '%APP_SHORT_NAME%': APP_SHORT_NAME,
            '%APP_DESCRIPTION%': APP_DESCRIPTION,
            '%BRAND_NAME%': BRAND_NAME,
            '%SEO_TITLE%': SITE_TITLE,
            '%SEO_DESCRIPTION%': SITE_DESCRIPTION,
            '%SEO_KEYWORDS%': SITE_KEYWORDS,
            '%SEO_URL%': SITE_URL,
            '%SEO_IMAGE_URL%': SEO_IMAGE_URL,
            '%SEO_IMAGE_WIDTH%': String(SOCIAL_IMAGE.width),
            '%SEO_IMAGE_HEIGHT%': String(SOCIAL_IMAGE.height),
            '%SEO_IMAGE_ALT%': SOCIAL_IMAGE.alt,
            '%SEO_JSON_LD%': jsonLd,
          }
          return Object.entries(tokens).reduce((output, [tokenKey, value]) => output.split(tokenKey).join(value), html)
          },
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script',
        includeAssets: [
          'icons/apple-touch-icon-180.png',
          'favicon.svg',
          'theme-init.js',
          'install-screenshots/home-light.png',
          'install-screenshots/home-dark.png',
        ],
        manifest: {
          name: `${APP_NAME} by ${BRAND_NAME}`,
          short_name: APP_SHORT_NAME,
          description: `${APP_NAME} by ${BRAND_NAME} tracks every review deal, refund form, mediator payment and deadline in one private place.`,
          categories: ['business', 'productivity', 'finance'],
          id: `/${APP_SLUG}`,
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: token('--color-brand'),
          background_color: token('--color-bg'),
          lang: 'en-IN',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          screenshots: [
            { src: '/install-screenshots/home-light.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: `${APP_NAME} home, light theme` },
            { src: '/install-screenshots/home-dark.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: `${APP_NAME} home, dark theme` },
          ],
        },
        workbox: {
          // A waiting worker never takes over on its own when the register script is injected, so new deploys
          // stayed stuck behind the old cached shell. Claim clients immediately; main.tsx reloads once on
          // controllerchange.
          skipWaiting: true,
          clientsClaim: true,
          // App shell only. The service worker never caches /api responses or serves the SPA fallback for them,
          // so OAuth redirects and /api/me always hit the network.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          globIgnores: ['**/og-cover.png'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, xfwd: true },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, xfwd: true },
      },
    },
  }
})
