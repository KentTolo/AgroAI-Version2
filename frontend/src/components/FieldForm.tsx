import { zodResolver } from '@hookform/resolvers/zod'
import { Crosshair } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { Field, FieldInput } from '@/lib/types'
import { FieldMap } from './FieldMap'
import { FormField, Input, Select, Textarea } from './ui/Form'

const SOIL_TYPES = ['Clay', 'Clay loam', 'Loam', 'Sandy loam', 'Sandy', 'Silt loam', 'Other']

const optionalNumber = (min: number, max: number) =>
  z
    .union([z.number().min(min).max(max), z.nan()])
    .optional()
    .transform((v) => (v === undefined || Number.isNaN(v) ? null : v))

const schema = z
  .object({
    name: z.string().trim().min(1, 'Give the field a name').max(120),
    latitude: optionalNumber(-90, 90),
    longitude: optionalNumber(-180, 180),
    area_hectares: z
      .union([z.number().gt(0, 'Area must be more than 0').max(100_000), z.nan()])
      .optional()
      .transform((v) => (v === undefined || Number.isNaN(v) ? null : v)),
    soil_type: z.string().optional().transform((v) => v || null),
    notes: z.string().max(2000).optional().transform((v) => v?.trim() || null),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    path: ['longitude'],
    message: 'Set both latitude and longitude, or neither',
  })

type FormInput = z.input<typeof schema>

interface FieldFormProps {
  id: string
  field?: Field
  onSubmit: (values: FieldInput) => void
}

export function FieldForm({ id, field, onSubmit }: FieldFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FieldInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: field?.name ?? '',
      latitude: field?.latitude ?? undefined,
      longitude: field?.longitude ?? undefined,
      area_hectares: field?.area_hectares ?? undefined,
      soil_type: field?.soil_type ?? '',
      notes: field?.notes ?? '',
    },
  })

  const [lat, lng] = useWatch({ control, name: ['latitude', 'longitude'] })
  const hasPoint = typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)

  return (
    <form id={id} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FormField label="Field name" error={errors.name?.message}>
        {({ id: inputId, invalid }) => (
          <Input id={inputId} invalid={invalid} placeholder="e.g. North plot" {...register('name')} />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Area" suffix="hectares" error={errors.area_hectares?.message}>
          {({ id: inputId, invalid }) => (
            <Input
              id={inputId}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              invalid={invalid}
              {...register('area_hectares', { valueAsNumber: true })}
            />
          )}
        </FormField>
        <FormField label="Soil type">
          {({ id: inputId }) => (
            <Select id={inputId} {...register('soil_type')}>
              <option value="">Not specified</option>
              {SOIL_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          <Crosshair className="size-4 text-fg-subtle" aria-hidden />
          Location
          <span className="font-normal text-fg-subtle">· click the map or enter coordinates</span>
        </p>
        <FieldMap
          className="h-56"
          zoom={hasPoint ? 13 : 8}
          points={hasPoint ? [{ id: 'new', name: 'Selected location', latitude: lat, longitude: lng }] : []}
          onPick={(la, ln) => {
            setValue('latitude', la, { shouldValidate: true, shouldDirty: true })
            setValue('longitude', ln, { shouldValidate: true, shouldDirty: true })
          }}
        />
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <FormField label="Latitude" error={errors.latitude?.message}>
            {({ id: inputId, invalid }) => (
              <Input
                id={inputId}
                type="number"
                step="any"
                inputMode="decimal"
                invalid={invalid}
                {...register('latitude', { valueAsNumber: true })}
              />
            )}
          </FormField>
          <FormField label="Longitude" error={errors.longitude?.message}>
            {({ id: inputId, invalid }) => (
              <Input
                id={inputId}
                type="number"
                step="any"
                inputMode="decimal"
                invalid={invalid}
                {...register('longitude', { valueAsNumber: true })}
              />
            )}
          </FormField>
        </div>
      </div>

      <FormField label="Notes" hint="Optional" error={errors.notes?.message}>
        {({ id: inputId, describedBy }) => (
          <Textarea id={inputId} aria-describedby={describedBy} rows={3} {...register('notes')} />
        )}
      </FormField>
    </form>
  )
}
