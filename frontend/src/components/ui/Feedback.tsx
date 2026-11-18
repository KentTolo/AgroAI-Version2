import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-fg-muted',
  brand: 'bg-brand-soft text-brand-soft-fg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertIcons
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const Icon = alertIcons[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx('flex gap-3 rounded-xl px-4 py-3 text-sm', badgeTones[tone], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg-muted [&_a]:underline">{children}</div>}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-highlight text-highlight-fg [&_svg]:size-6">
        {icon}
      </div>
      <h3 className="font-display text-xl font-medium text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-subtle">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  tone = 'brand',
  label,
  className,
}: {
  value: number
  tone?: 'brand' | 'accent'
  label: string
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      className={clsx('h-2 overflow-hidden rounded-full bg-surface-muted', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div
        className={clsx('h-full rounded-full', tone === 'brand' ? 'bg-brand' : 'bg-accent')}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
