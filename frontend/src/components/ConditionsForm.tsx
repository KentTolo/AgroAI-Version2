import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { PARAMETERS } from '@/lib/parameters'
import type { GrowingConditions } from '@/lib/types'
import { FormField, Input } from './ui/Form'

const schema = z.object(
  Object.fromEntries(
    PARAMETERS.map((p) => [
      p.key,
      z
        .number({ error: 'Enter a number' })
        .min(p.min, `Must be at least ${p.min}`)
        .max(p.max, `Must be at most ${p.max}`),
    ]),
  ) as Record<keyof GrowingConditions, z.ZodNumber>,
)

interface ConditionsFormProps {
  id: string
  defaultValues?: Partial<GrowingConditions>
  /** Replaces the form contents whenever it changes (e.g. after loading a field reading). */
  values?: GrowingConditions | null
  onSubmit: (values: GrowingConditions) => void
  footer?: ReactNode
}

const GROUPS = [
  { key: 'soil', title: 'Soil' },
  { key: 'climate', title: 'Climate' },
] as const

export function ConditionsForm({ id, defaultValues, values, onSubmit, footer }: ConditionsFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GrowingConditions>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  useEffect(() => {
    if (values) reset(values)
  }, [values, reset])

  return (
    <form id={id} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {GROUPS.map((group) => (
        <fieldset key={group.key}>
          <legend className="mb-3 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
            {group.title}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {PARAMETERS.filter((p) => p.group === group.key).map((p) => (
              <FormField
                key={p.key}
                label={p.label}
                suffix={p.unit || undefined}
                error={errors[p.key]?.message}
              >
                {({ id: inputId, describedBy, invalid }) => (
                  <Input
                    id={inputId}
                    type="number"
                    inputMode="decimal"
                    step={p.step}
                    min={p.min}
                    max={p.max}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    {...register(p.key, { valueAsNumber: true })}
                  />
                )}
              </FormField>
            ))}
          </div>
        </fieldset>
      ))}
      {footer}
    </form>
  )
}
