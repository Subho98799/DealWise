import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedLayout } from './components/ProtectedLayout'
import { InstallPrompt } from './components/InstallPrompt'
import LoginPage from './pages/Login'
import HomePage from './pages/Home'
import DealsPage from './pages/Deals'
import DealFormPage from './pages/DealForm'
import DealDetailPage from './pages/DealDetail'
import { MediatorDetailPage, MediatorsPage } from './pages/Mediators'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<HomePage />} />
          <Route path="deals" element={<DealsPage />} />
          <Route path="deals/new" element={<DealFormPage />} />
          <Route path="deals/:id" element={<DealDetailPage />} />
          <Route path="deals/:id/edit" element={<DealFormPage />} />
          <Route path="mediators" element={<MediatorsPage />} />
          <Route path="mediators/:id" element={<MediatorDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt />
    </>
  )
}
