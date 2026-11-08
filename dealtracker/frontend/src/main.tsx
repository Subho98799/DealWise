import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { isUnauthorized } from './lib/api'
import { ME_KEY } from './lib/auth'
import './index.css'

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
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
