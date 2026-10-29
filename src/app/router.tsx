import { createBrowserRouter, Navigate } from 'react-router'
import App from './App'
import { ErrorBoundary } from './error-boundary'
import { RequireAuth } from './require-auth'
import { LoginPage } from './pages/login-page'
import { ForgotPasswordPage } from './pages/forgot-password-page'
import { AcceptInvitationPage } from './pages/accept-invitation-page'
import { RoleProvider } from './lib/use-role'
import { PageTitleProvider } from './lib/use-page-title'
import { RoleGate } from './role-gate'
import { DashboardRoute } from './pages/dashboard-route'
import { ClientsPage } from './pages/clients-page'
import { TeamPage } from './pages/team-page'
import { TeamDataProvider } from './pages/team-data'
import { MonthlyOperationPage } from './pages/monthly-operation-page'
import { MonthlyOperationProvider } from './pages/monthly-operation-data'
import { CobrosPage, PagosPage } from './pages/cobranza-page'
import { BillingPage } from './pages/billing-page'
import { CuentasCorrientesPage } from './pages/cuentas-corrientes-page'
import { CashflowPage } from './pages/cashflow-page'
import { ReceivablesProvider } from './pages/receivables-data'
import { PaymentsProvider } from './pages/payments-data'
import { TreasuryProvider } from './pages/treasury-data'
import { ReportsPage } from './pages/reports-page'
import { SettingsPage } from './pages/settings-page'
import { DocsPage } from './pages/docs-page'
import { NotificationsPage } from './pages/notifications-page'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/recuperar-contrasena', element: <ForgotPasswordPage /> },
  { path: '/aceptar-invitacion', element: <AcceptInvitationPage /> },
  {
    path: '/',
    element: (
      <ErrorBoundary>
        <RequireAuth>
          <RoleProvider>
            <TeamDataProvider>
              <ReceivablesProvider>
                <PaymentsProvider>
                  <TreasuryProvider>
                    <MonthlyOperationProvider>
                      <PageTitleProvider>
                        <App />
                      </PageTitleProvider>
                    </MonthlyOperationProvider>
                  </TreasuryProvider>
                </PaymentsProvider>
              </ReceivablesProvider>
            </TeamDataProvider>
          </RoleProvider>
        </RequireAuth>
      </ErrorBoundary>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardRoute /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'team', element: <TeamPage /> },
      {
        path: 'operacion-mensual',
        element: (
          <RoleGate path="/operacion-mensual">
            <MonthlyOperationPage />
          </RoleGate>
        ),
      },
      {
        path: 'cobros',
        element: (
          <RoleGate path="/cobros">
            <CobrosPage />
          </RoleGate>
        ),
      },
      {
        path: 'pagos',
        element: (
          <RoleGate path="/pagos">
            <PagosPage />
          </RoleGate>
        ),
      },
      {
        path: 'billing',
        element: (
          <RoleGate path="/billing">
            <BillingPage />
          </RoleGate>
        ),
      },
      {
        path: 'cuentas-corrientes',
        element: (
          <RoleGate path="/cuentas-corrientes">
            <CuentasCorrientesPage />
          </RoleGate>
        ),
      },
      {
        path: 'cashflow',
        element: (
          <RoleGate path="/cashflow">
            <CashflowPage />
          </RoleGate>
        ),
      },
      {
        path: 'reports',
        element: (
          <RoleGate path="/reports">
            <ReportsPage />
          </RoleGate>
        ),
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'notificaciones', element: <NotificationsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])
