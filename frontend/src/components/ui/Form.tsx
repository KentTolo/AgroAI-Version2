import { clsx } from 'clsx'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

const control =
  'block w-full rounded-lg border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60'

function controlClass(invalid: boolean, extra?: string) {
  return clsx(
    control,
    invalid ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-ring',
    extra,
  )
}

interface FieldWrapperProps {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
  suffix?: ReactNode
}

/** Label, control, hint and error message, wired together for screen readers. */
export function FormField({ label, hint, error, children, className, suffix }: FieldWrapperProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = clsx(hint && hintId, error && errorId) || undefined
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {suffix && <span className="text-xs text-fg-subtle">{suffix}</span>}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs text-fg-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function Input({ invalid = false, className, ...props }: InputProps) {
  return (
    <input
      className={controlClass(invalid, clsx('h-10', className))}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ invalid = false, className, children, ...props }: SelectProps) {
  return (
    <select
      className={controlClass(invalid, clsx('h-10 pr-8', className))}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ invalid = false, className, ...props }: TextareaProps) {
  return (
    <textarea
      className={controlClass(invalid, clsx('min-h-20 py-2', className))}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
}
