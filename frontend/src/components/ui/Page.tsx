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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-fg-subtle">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
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
    <div className={clsx('rounded-xl border border-line bg-surface p-4 shadow-card', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand-soft-fg [&_svg]:size-4">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  )
}
