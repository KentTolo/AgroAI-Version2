import { clsx } from 'clsx'
import {
  BookOpen,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Logo } from './Logo'

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/fields', label: 'Fields', icon: Map },
  { to: '/app/recommend', label: 'Recommend', icon: Sparkles },
  { to: '/app/advisor', label: 'Crop advisor', icon: ClipboardCheck },
  { to: '/app/crops', label: 'Crop library', icon: BookOpen },
  { to: '/app/history', label: 'History', icon: History },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-1 px-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-soft text-brand-soft-fg'
                  : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
              )
            }
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <NavLink
          to="/app/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
              isActive ? 'bg-surface-muted' : 'hover:bg-surface-muted',
            )
          }
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
            {user ? initials(user.full_name) : '?'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">{user?.full_name}</span>
            <span className="block truncate text-xs text-fg-subtle">{user?.email}</span>
          </span>
          <Settings className="size-4 shrink-0 text-fg-subtle" aria-label="Settings" />
        </NavLink>
        <button
          type="button"
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-muted hover:text-fg"
        >
          <LogOut className="size-4.5" aria-hidden />
          Sign out
        </button>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <Link to="/app" className="px-6 py-5">
          <Logo />
        </Link>
        <Navigation />
      </aside>

      {/* Mobile top bar and drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/app">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-fg-muted hover:bg-surface-muted"
          aria-label="Open menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-pop">
            <div className="flex items-center justify-between px-5 py-4">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-fg-muted hover:bg-surface-muted"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <Navigation onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
