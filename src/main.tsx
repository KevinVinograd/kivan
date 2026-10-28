import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queries/queryClient'
import { invalidateDerivedOnWrite } from './queries/derived-invalidation'
import { AuthProvider } from './app/lib/auth-store'
import { router } from './app/router'
import './styles/index.css'

// For the app's lifetime: every confirmed write refreshes the read models it can reach.
invalidateDerivedOnWrite(queryClient)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
