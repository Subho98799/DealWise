import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import { ProtectedLayout } from './components/ProtectedLayout'
import LoginPage from './pages/Login'
import PrivacyPage from './pages/Privacy'
import TermsPage from './pages/Terms'
import HomePage from './pages/Home'
import DealsPage from './pages/Deals'

const DealFormPage = lazy(() => import('./pages/DealForm'))
const DealDetailPage = lazy(() => import('./pages/DealDetail'))
const MediatorsPage = lazy(() => import('./pages/Mediators').then((module) => ({ default: module.MediatorsPage })))
const MediatorDetailPage = lazy(() => import('./pages/Mediators').then((module) => ({ default: module.MediatorDetailPage })))
const SettingsPage = lazy(() => import('./pages/Settings'))
const ImportPage = lazy(() => import('./pages/ImportPage'))

export default function App() {
  const location = useLocation()
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation
  return (
    <Routes location={backgroundLocation ?? location}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route element={<ProtectedLayout quickAddModal={!!backgroundLocation} />}>
        <Route index element={<HomePage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="deals/new" element={<DealFormPage />} />
        <Route path="deals/:id" element={<DealDetailPage />} />
        <Route path="deals/:id/edit" element={<DealFormPage />} />
        <Route path="mediators" element={<MediatorsPage />} />
        <Route path="mediators/:id" element={<MediatorDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="import" element={<ImportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
