import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  useDocumentTitle(title)
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-fg-subtle">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-medium tracking-tight text-fg sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('rounded-2xl border border-line bg-surface p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-fg-muted">{label}</p>
        <span className="hidden shrink-0 text-fg-subtle sm:block [&_svg]:size-4.5">{icon}</span>
      </div>
      <p className="mt-3 font-display text-4xl font-medium tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  )
}
