import { clsx } from 'clsx'
import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  History,
  LayoutGrid,
  LogOut,
  Map,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { DEMO_MODE } from '@/lib/api'
import { DemoBanner } from './DemoBanner'
import { Logo } from './Logo'

const NAV = [
  { to: '/app', label: 'Overview', short: 'Home', icon: LayoutGrid, end: true },
  { to: '/app/fields', label: 'Fields', short: 'Fields', icon: Map },
  { to: '/app/recommend', label: 'Recommend', short: 'Recommend', icon: Sparkles },
  { to: '/app/advisor', label: 'Advisor', short: 'Advisor', icon: ClipboardCheck },
  { to: '/app/crops', label: 'Crop library', short: 'Crops', icon: BookOpen },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const [lastPath, setLastPath] = useState(location.pathname)

  // Close when navigating (adjusting state during render, as React recommends).
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-fg hover:bg-surface-muted [&_svg]:size-4 [&_svg]:text-fg-subtle'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1 hover:border-line-strong"
      >
        <span className="grid size-8 place-items-center rounded-full bg-highlight text-xs font-bold text-highlight-fg">
          {user ? initials(user.full_name) : '?'}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {user?.full_name.split(' ')[0]}
        </span>
        <ChevronDown className="size-4 text-fg-subtle" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-12 right-0 z-50 w-64 rounded-2xl border border-line bg-surface p-2 shadow-pop"
        >
          <div className="px-3 pt-2 pb-3">
            <p className="truncate text-sm font-semibold">{user?.full_name}</p>
            <p className="truncate text-xs text-fg-subtle">{user?.email}</p>
          </div>
          <div className="border-t border-line pt-2">
            {user?.is_admin && (
              <Link role="menuitem" to="/app/admin" className={item}>
                <ShieldCheck /> Admin dashboard
              </Link>
            )}
            <Link role="menuitem" to="/app/history" className={item}>
              <History /> Recommendation history
            </Link>
            <Link role="menuitem" to="/app/settings" className={item}>
              <Settings /> Settings
            </Link>
            <button role="menuitem" type="button" onClick={logout} className={item}>
              <LogOut /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AppLayout() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {DEMO_MODE && <DemoBanner />}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/app" aria-label="AgroAI overview">
            <Logo />
          </Link>
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-fg text-bg'
                      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Main"
      >
        <div className="grid grid-cols-5">
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold',
                  isActive ? 'text-fg' : 'text-fg-subtle',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'grid h-7 w-12 place-items-center rounded-full transition-colors',
                      isActive && 'bg-highlight text-highlight-fg',
                    )}
                  >
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  {short}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
