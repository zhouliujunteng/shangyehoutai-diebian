import { Routes, Route, Navigate } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, RequireAuth } from '@/lib/auth'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import FillPage from '@/pages/fill/FillPage'
import ClientLayout from '@/pages/client/ClientLayout'
import ClientDashboard from '@/pages/client/ClientDashboard'
import ProjectDetail from '@/pages/client/ProjectDetail'
import CustomerLayout from '@/pages/customer/CustomerLayout'
import CustomerDashboard from '@/pages/customer/CustomerDashboard'
import ServerLayout from '@/pages/server/ServerLayout'
import ProjectsOverview from '@/pages/server/ProjectsOverview'
import ReviewWorkbench from '@/pages/server/ReviewWorkbench'
import ReviewDetail from '@/pages/server/ReviewDetail'
import RepliesList from '@/pages/server/RepliesList'
import ProjectReplies from '@/pages/server/ProjectReplies'
import Accounts from '@/pages/server/Accounts'
import AccountSettings from '@/pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/f/:token" element={<FillPage />} />
        <Route
          path="/client"
          element={
            <RequireAuth roles={['client']}>
              <ClientLayout />
            </RequireAuth>
          }
        >
          <Route index element={<ClientDashboard />} />
          <Route path="project/:id" element={<ProjectDetail />} />
          <Route path="settings" element={<AccountSettings />} />
        </Route>
        <Route
          path="/customer"
          element={
            <RequireAuth roles={['customer']}>
              <CustomerLayout />
            </RequireAuth>
          }
        >
          <Route index element={<CustomerDashboard />} />
          <Route path="project/:id" element={<ProjectDetail />} />
          <Route path="settings" element={<AccountSettings />} />
        </Route>
        <Route
          path="/server"
          element={
            <RequireAuth roles={['super_admin', 'reviewer']}>
              <ServerLayout />
            </RequireAuth>
          }
        >
          <Route index element={<ProjectsOverview />} />
          <Route path="review" element={<ReviewWorkbench />} />
          <Route path="review/:id" element={<ReviewDetail />} />
          <Route path="replies" element={<RepliesList />} />
          <Route path="replies/:projectId" element={<ProjectReplies />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="settings" element={<AccountSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster richColors position="top-center" />
    </AuthProvider>
  )
}
