import { clsx } from 'clsx'

/** Three terraced contour lines rising to a peak: highlands and planted rows in one mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('size-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M7 23.5c3.2-1.6 6-1.6 9 0s5.8 1.6 9 0" stroke="var(--highlight)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M9.5 18.5c2.2-1.2 4.4-1.2 6.5 0s4.3 1.2 6.5 0" stroke="var(--highlight)" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.75" />
      <path d="M12.5 13.5 16 8l3.5 5.5" stroke="var(--ink-fg)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span
        className={clsx(
          'font-display text-xl font-semibold tracking-tight',
          inverted ? 'text-ink-fg' : 'text-fg',
        )}
      >
        agro<span className="italic">ai</span>
      </span>
    </span>
  )
}
