import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { isUnauthorized } from './lib/api'
import { ME_KEY } from './lib/auth'
import { applyAppearance, readAppearance, readColorTheme } from './lib/appearance'
import { PwaInstallProvider } from './lib/usePwaInstall'
import './index.css'

applyAppearance(readAppearance(), readColorTheme())
const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
const syncThemeColor = () => {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
  if (color) themeColor?.setAttribute('content', color)
}
syncThemeColor()
new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] })
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor)

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    // Any 401 from any query means the session is gone: re-check /api/me, which routes to /login.
    onError: (err, query) => {
      if (isUnauthorized(err) && query.queryKey[0] !== ME_KEY[0]) {
        queryClient.invalidateQueries({ queryKey: ME_KEY })
      }
    },
  }),
  // networkMode 'always': our fetchers handle offline themselves (cached /api/me, visible errors);
  // TanStack's default would silently pause them while offline.
  defaultOptions: { queries: { refetchOnWindowFocus: false, networkMode: 'always' }, mutations: { networkMode: 'always' } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PwaInstallProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </PwaInstallProvider>
    </QueryClientProvider>
  </StrictMode>,
)
