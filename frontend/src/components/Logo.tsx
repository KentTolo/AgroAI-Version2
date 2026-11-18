import { clsx } from 'clsx'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('size-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M16 25V13" stroke="var(--brand-fg)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 17c0-4.4 3.1-7.5 7.5-7.5 0 4.4-3.1 7.5-7.5 7.5Z" fill="var(--brand-fg)" opacity="0.7" />
      <path d="M16 20.5c0-3.6-2.6-6.2-6.2-6.2 0 3.6 2.6 6.2 6.2 6.2Z" fill="var(--brand-fg)" />
    </svg>
  )
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span
        className={clsx(
          'text-lg font-semibold tracking-tight',
          inverted ? 'text-white' : 'text-fg',
        )}
      >
        Agro<span className={inverted ? 'text-white/80' : 'text-brand'}>AI</span>
      </span>
    </span>
  )
}
