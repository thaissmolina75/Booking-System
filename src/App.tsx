import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminPage } from '@/admin/AdminPage'
import { PostAuthRedirect, RequireAuth, RequireMember, RequirePlatformAdmin } from '@/auth/guards'
import { BusinessProvider } from '@/dashboard/BusinessProvider'
import { BookingsPage } from '@/dashboard/BookingsPage'
import { CalendarPage } from '@/dashboard/CalendarPage'
import { DashboardLayout, OwnerOnly } from '@/dashboard/DashboardLayout'
import { SettingsPage } from '@/dashboard/SettingsPage'
import { TeamPage } from '@/dashboard/TeamPage'
import { ToursPage } from '@/dashboard/ToursPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { InvitePage } from '@/pages/InvitePage'
import { LoginPage } from '@/pages/LoginPage'
import { NoAccessPage } from '@/pages/NoAccessPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { SignupPage } from '@/pages/SignupPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <PostAuthRedirect />
          </RequireAuth>
        }
      />
      <Route
        path="/no-access"
        element={
          <RequireAuth>
            <NoAccessPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/*"
        element={
          <RequireAuth>
            <RequirePlatformAdmin>
              <AdminPage />
            </RequirePlatformAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <RequireMember>
              <BusinessProvider>
                <DashboardLayout />
              </BusinessProvider>
            </RequireMember>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="bookings" replace />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tours" element={<OwnerOnly><ToursPage /></OwnerOnly>} />
        <Route path="team" element={<OwnerOnly><TeamPage /></OwnerOnly>} />
        <Route path="settings" element={<OwnerOnly><SettingsPage /></OwnerOnly>} />
        <Route path="*" element={<Navigate to="bookings" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
