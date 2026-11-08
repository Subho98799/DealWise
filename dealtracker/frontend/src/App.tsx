import { Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import { ProtectedLayout } from './components/ProtectedLayout'
import LoginPage from './pages/Login'
import HomePage from './pages/Home'
import DealsPage from './pages/Deals'
import DealFormPage from './pages/DealForm'
import DealDetailPage from './pages/DealDetail'
import { MediatorDetailPage, MediatorsPage } from './pages/Mediators'
import SettingsPage from './pages/Settings'
import ImportPage from './pages/ImportPage'

export default function App() {
  const location = useLocation()
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation
  return (
    <>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/login" element={<LoginPage />} />
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
    </>
  )
}
