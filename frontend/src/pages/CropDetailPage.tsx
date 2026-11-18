import { CalendarClock, ChevronLeft, ClipboardCheck, Leaf, RefreshCcw } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, Badge } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { ApiError } from '@/lib/api'
import { durationLabel, formatNumber } from '@/lib/format'
import { PARAMETERS } from '@/lib/parameters'
import { useCrop } from '@/lib/queries'
import type { ParameterRange } from '@/lib/types'
import { NotFoundPage } from './ErrorPages'

function RequirementBar({ range }: { range: ParameterRange }) {
  const span = range.max - range.min || 1
  const pct = (v: number) => ((v - range.min) / span) * 100
  return (
    <div className="relative h-2.5 rounded-full bg-surface-muted" aria-hidden>
      <div
        className="absolute inset-y-0 rounded-full bg-brand/70"
        style={{ left: `${pct(range.optimal_min)}%`, width: `${Math.max(pct(range.optimal_max) - pct(range.optimal_min), 1)}%` }}
      />
      <div
        className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-fg"
        style={{ left: `${pct(range.typical)}%` }}
      />
    </div>
  )
}

export default function CropDetailPage() {
  const { slug = '' } = useParams()
  const crop = useCrop(slug)

  if (crop.isPending) return <LoadingBlock label="Loading crop" />
  if (crop.isError) {
    if (crop.error instanceof ApiError && crop.error.status === 404) return <NotFoundPage inline />
    return <Alert tone="danger">{crop.error.message}</Alert>
  }
  const c = crop.data

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/app/crops" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" aria-hidden /> Crop library
          </Link>
        }
        title={c.name}
        description={c.description}
        actions={
          <ButtonLink to={`/app/advisor?crop=${c.slug}`} icon={<ClipboardCheck />}>
            Check my conditions
          </ButtonLink>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone="brand">
          <Leaf className="size-3" aria-hidden /> {c.category}
        </Badge>
        <Badge>
          <RefreshCcw className="size-3" aria-hidden /> {c.lifecycle}
        </Badge>
        <Badge>
          <CalendarClock className="size-3" aria-hidden /> {durationLabel(c)}
        </Badge>
      </div>

      <Card>
        <CardHeader
          title="Growing conditions"
          description="The shaded band is the optimal range (the middle 80% of observations); the line marks the typical value."
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {PARAMETERS.map((p) => {
              const range = c.requirements[p.key]
              return (
                <li key={p.key} className="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_9rem] sm:items-center sm:gap-6">
                  <span className="text-sm font-medium">{p.label}</span>
                  <div>
                    <RequirementBar range={range} />
                    <div className="mt-1 flex justify-between text-xs text-fg-subtle tabular-nums">
                      <span>{formatNumber(range.min)}</span>
                      <span>{formatNumber(range.max)}</span>
                    </div>
                  </div>
                  <span className="text-sm text-fg-muted tabular-nums sm:text-right">
                    {formatNumber(range.optimal_min)}–{formatNumber(range.optimal_max)} {p.unit}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>
      <p className="mt-4 text-xs text-fg-subtle">
        Ranges are derived from the training dataset. Durations are typical planning values and
        vary with variety, altitude and season.
      </p>
    </>
  )
}
