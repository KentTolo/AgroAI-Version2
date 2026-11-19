import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Layers } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import { soilPatch, type SoilPatch } from '@/lib/soil'

interface Props {
  latitude: number | null
  longitude: number | null
  /** Fill the form as soon as the values load (e.g. a field with no soil test yet). */
  autoApply?: boolean
  onApply: (patch: SoilPatch) => void
}

/**
 * Typical topsoil pH, N, P and K for a location, from public soil maps. Farmers start from these
 * and overwrite them with their own soil test or sensor readings.
 */
export function SoilDefaultsPanel({ latitude, longitude, autoApply = false, onApply }: Props) {
  const defaults = useQuery({
    queryKey: ['soil-defaults', latitude, longitude],
    queryFn: () => api.soilDefaults(latitude, longitude),
    staleTime: Infinity,
  })
  const [open, setOpen] = useState(false)
  const [clicked, setClicked] = useState(false)
  const autoFill = useEffectEvent((patch: SoilPatch) => onApply(patch))
  useEffect(() => {
    if (autoApply && defaults.data) autoFill(soilPatch(defaults.data))
  }, [autoApply, defaults.data])
  const applied = clicked || (autoApply && Boolean(defaults.data))

  if (!defaults.data) return null
  const d = defaults.data
  return (
    <div className="rounded-xl border border-line bg-surface-muted/60 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Layers className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <div>
            <p className="font-medium">
              {d.scope === 'local' ? `Typical soil here · ${d.district}` : 'Typical soil in Lesotho'}
            </p>
            <p className="text-xs text-fg-muted tabular-nums">
              pH {formatNumber(d.ph)} · N {formatNumber(d.nitrogen, 0)} · P {formatNumber(d.phosphorus, 0)} · K{' '}
              {formatNumber(d.potassium, 0)} kg/ha
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={applied ? 'ghost' : 'secondary'}
          onClick={() => {
            onApply(soilPatch(d))
            setClicked(true)
          }}
        >
          {applied ? 'Filled in · refill' : 'Use these'}
        </Button>
      </div>
      {applied && (
        <p className="mt-2 text-xs text-fg-muted">
          These are estimates for the area, not your field. Replace them with your own soil test or sensor readings
          when you have them.
        </p>
      )}
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Where these come from
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 text-xs text-fg-muted">
          <p>{d.description}, from the iSDAsoil soil maps of Africa (30 m resolution, top 20 cm, CC BY 4.0):</p>
          <p className="tabular-nums text-fg">
            pH {formatNumber(d.lab.ph)} · total nitrogen {formatNumber(d.lab.nitrogen_total_g_kg, 2)} g/kg · phosphorus{' '}
            {formatNumber(d.lab.phosphorus_ppm)} mg/kg · potassium {formatNumber(d.lab.potassium_ppm, 0)} mg/kg
          </p>
          <p>
            Converted to kg/ha for the top 20 cm of soil (bulk density {formatNumber(d.lab.bulk_density_g_cm3, 2)}{' '}
            g/cm³). Nitrogen is the share that becomes available to plants in a season (about 2% of the total).
          </p>
          {d.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </div>
  )
}
