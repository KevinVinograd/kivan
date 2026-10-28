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

/**
 * Application route table. The root route mounts the layout (AppShell + Outlet);
 * each nav target resolves to a page. Workspace stores live above every route, in
 * dependency order: TeamDataProvider (roster + client relationship), then the
 * canonical finance stores ReceivablesProvider + PaymentsProvider, then
 * MonthlyOperationProvider (the monthly dataset that Operación mensual reads and
 * mutates). The order matters: Operación mensual now derives its per-client cobro
 * actuals from the canonical Receivable store (actuals-shared, audit B-1a), so
 * MonthlyOperationProvider is nested BELOW ReceivablesProvider to consume it. The
 * Receivable dataset lives in ReceivablesProvider, shared by Cobros (/cobros) and
 * Facturación (/billing) so a factura issued on either surface is reflected on the
 * other. The Payment dataset lives in PaymentsProvider (the /pagos outgoing-payments
 * store, lifted out of PagosTab local state so it can be shared and derived from).
 * Clients and Team are wired to the master-detail
 * harness; Reportes reads the existing mock across modules to render its read-only
 * analytics. Settings resolves to the role-scoped Configuración module (Apariencia
 * wired to the real theme, the rest presentational over local state). The
 * role-resolved activity log is a review drawer opened from each dashboard's
 * Actividad reciente section (no route, no nav item). The index and unknown paths
 * redirect to the Owner Dashboard, /dashboard.
 *
 * RoleProvider wraps the whole tree so the active role drives the /dashboard
 * variant (owner = Owner Dashboard, employee = Employee Dashboard, admin = Admin
 * Operations Dashboard), the per-page perspectives, and the floating role-switcher
 * in App. Owner/admin-only routes (/operacion-mensual, /reports, and the Finanzas
 * group /cobros, /pagos, /billing) are wrapped in RoleGate so they redirect to
 * /dashboard for any other role, matching the SideNav filtering. It is the seam
 * future role-aware perspectives plug into.
 */
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
      // Guía de uso — static docs, open to every role, so no RoleGate wrapper.
      { path: 'docs', element: <DocsPage /> },
      // Avisos — the caller's own in-app inbox, so it is open to every role (no RoleGate).
      { path: 'notificaciones', element: <NotificationsPage /> },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])
