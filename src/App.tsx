import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminPage } from '@/admin/AdminPage'
import { PostAuthRedirect, RequireAuth, RequireMember, RequirePlatformAdmin } from '@/auth/guards'
import { BusinessProvider } from '@/dashboard/BusinessProvider'
import { ComingSoon, DashboardLayout, OwnerOnly } from '@/dashboard/DashboardLayout'
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
        <Route path="bookings" element={<ComingSoon title="Bookings" />} />
        <Route path="calendar" element={<ComingSoon title="Calendar" />} />
        <Route path="tours" element={<OwnerOnly><ComingSoon title="Tours" /></OwnerOnly>} />
        <Route path="team" element={<OwnerOnly><ComingSoon title="Team" /></OwnerOnly>} />
        <Route path="settings" element={<OwnerOnly><ComingSoon title="Settings" /></OwnerOnly>} />
        <Route path="*" element={<Navigate to="bookings" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
