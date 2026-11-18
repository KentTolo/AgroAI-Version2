import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RedirectIfAuthenticated, RequireAuth } from './auth/guards'
import { AppLayout } from './components/AppLayout'
import { FullPageSpinner, LoadingBlock } from './components/ui/Spinner'
import { ApiError } from './lib/api'
import { ErrorPage, NotFoundPage } from './pages/ErrorPages'
import { LandingPage } from './pages/LandingPage'

// Everything but the landing page is split out so the first visit loads fast.
const LoginPage = lazy(() => import('./pages/AuthPages').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() =>
  import('./pages/AuthPages').then((m) => ({ default: m.RegisterPage })),
)
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const FieldsPage = lazy(() => import('./pages/FieldsPage'))
const FieldDetailPage = lazy(() => import('./pages/FieldDetailPage'))
const RecommendPage = lazy(() => import('./pages/RecommendPage'))
const AdvisorPage = lazy(() => import('./pages/AdvisorPage'))
const CropsPage = lazy(() => import('./pages/CropsPage'))
const CropDetailPage = lazy(() => import('./pages/CropDetailPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
})

function Root() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  )
}

function AppPages() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Outlet />
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/app',
            element: <AppLayout />,
            children: [
              {
                element: <AppPages />,
                errorElement: <ErrorPage inline />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: 'fields', element: <FieldsPage /> },
                  { path: 'fields/:fieldId', element: <FieldDetailPage /> },
                  { path: 'recommend', element: <RecommendPage /> },
                  { path: 'advisor', element: <AdvisorPage /> },
                  { path: 'crops', element: <CropsPage /> },
                  { path: 'crops/:slug', element: <CropDetailPage /> },
                  { path: 'history', element: <HistoryPage /> },
                  { path: 'settings', element: <SettingsPage /> },
                  { path: '*', element: <NotFoundPage inline /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
