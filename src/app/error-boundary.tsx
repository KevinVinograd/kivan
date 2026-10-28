import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/app/components/components'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { hasError: boolean }

/**
 * Top-level error boundary. Catches render-time errors thrown by the data
 * providers or any routed page so a single failure degrades to a recoverable
 * fallback instead of a blank screen. Implemented as a class because React
 * exposes error boundaries only through the class lifecycle
 * (`getDerivedStateFromError` / `componentDidCatch`). Mock data does not throw
 * today, but real data and edge cases will once the backend lands, so this is
 * the graceful-degradation seam.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure for debugging. A real logger/telemetry sink replaces
    // this console once the backend is wired (logs tagged with the userId).
    console.error('[ErrorBoundary] Unhandled render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface-flat p-8 text-center"
      >
        <div className="flex flex-col gap-2">
          <h1 className="type-headline fg-default">Algo salió mal</h1>
          <p className="type-body-2 fg-subtle">
            Ocurrió un error inesperado. Probá recargar la página.
          </p>
        </div>
        <Button variant="solid" color="primary" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </div>
    )
  }
}
