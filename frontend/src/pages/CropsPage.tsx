import { clsx } from 'clsx'
import { CalendarClock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Feedback'
import { durationLabel, formatNumber } from '@/lib/format'
import { LESOTHO_STATUS } from '@/lib/labels'
import { useCrops } from '@/lib/queries'
import type { Crop, LesothoStatus } from '@/lib/types'

const CATEGORY_LABELS: Record<string, string> = {
  cereal: 'Cereals',
  legume: 'Legumes',
  fruit: 'Fruit',
  fibre: 'Fibre',
  plantation: 'Plantation',
  vegetable: 'Vegetables',
}

const STATUS_ORDER: LesothoStatus[] = ['staple', 'common', 'possible', 'unsuitable']

export default function CropsPage() {
  const crops = useCrops()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [showUnsuitable, setShowUnsuitable] = useState(false)

  const categories = useMemo(
    () => [...new Set((crops.data ?? []).map((c) => c.category))].sort(),
    [crops.data],
  )
  const filtered = (crops.data ?? []).filter(
    (c) =>
      (!category || c.category === category) &&
      c.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <>
      <PageHeader
        title="Crop library"
        description="Crops grown in Lesotho come first, with the conditions each one grows best in."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            placeholder="Search crops"
            aria-label="Search crops"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {[null, ...categories].map((cat) => (
            <button
              key={cat ?? 'all'}
              type="button"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
              className={clsx(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                category === cat
                  ? 'border-fg bg-fg text-bg'
                  : 'border-line text-fg-muted hover:bg-surface-muted',
              )}
            >
              {cat ? (CATEGORY_LABELS[cat] ?? cat) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {crops.isPending ? (
        <LoadingBlock label="Loading crops" />
      ) : crops.isError ? (
        <Alert tone="danger">{crops.error.message}</Alert>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg-subtle">No crops match your search.</p>
      ) : (
        <div className="space-y-10">
          {STATUS_ORDER.map((status) => {
            const group = filtered.filter((c) => c.lesotho === status)
            if (group.length === 0) return null
            const info = LESOTHO_STATUS[status]
            const collapsed = status === 'unsuitable' && !showUnsuitable && !query.trim()
            return (
              <section key={status} aria-labelledby={`crops-${status}`}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 id={`crops-${status}`} className="font-display text-xl font-medium">
                      {info.heading} <span className="text-fg-subtle tabular-nums">· {group.length}</span>
                    </h2>
                    <p className="text-sm text-fg-muted">{info.description}</p>
                  </div>
                  {status === 'unsuitable' && !query.trim() && (
                    <button
                      type="button"
                      className="text-sm font-medium text-brand hover:underline"
                      onClick={() => setShowUnsuitable((v) => !v)}
                    >
                      {showUnsuitable ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
                {!collapsed && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {group.map((crop) => (
                      <CropCard key={crop.slug} crop={crop} />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function CropCard({ crop }: { crop: Crop }) {
  return (
    <Link
      to={`/app/crops/${crop.slug}`}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-fg/30"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-medium group-hover:underline decoration-highlight decoration-2 underline-offset-4">{crop.name}</h3>
        <Badge>{CATEGORY_LABELS[crop.category]?.replace(/s$/, '') ?? crop.category}</Badge>
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-fg-muted">{crop.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-fg-subtle">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden />
          {durationLabel(crop)}
        </span>
        <span className="tabular-nums">
          {formatNumber(crop.requirements.temperature.optimal_min, 0)}–
          {formatNumber(crop.requirements.temperature.optimal_max, 0)}°C
        </span>
        <span className="tabular-nums">
          pH {formatNumber(crop.requirements.ph.optimal_min)}–{formatNumber(crop.requirements.ph.optimal_max)}
        </span>
        {!crop.model_ranked && <span className="text-info">Advisor only</span>}
      </div>
    </Link>
  )
}
