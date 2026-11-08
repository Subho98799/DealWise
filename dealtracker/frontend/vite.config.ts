import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, APP_SLUG } from './src/config/app'

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
        name: 'app-name-html',
        transformIndexHtml: (html: string) => html.replace(/%APP_NAME%/g, APP_NAME)
          .replace(/%APP_SHORT_NAME%/g, APP_SHORT_NAME).replace(/%APP_DESCRIPTION%/g, APP_DESCRIPTION),
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
          name: APP_NAME,
          short_name: APP_SHORT_NAME,
          description: APP_DESCRIPTION,
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
          // App shell only. /api is NEVER cached in Phase 1 and never served the SPA fallback,
          // so OAuth redirects and /api/me always hit the network.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
