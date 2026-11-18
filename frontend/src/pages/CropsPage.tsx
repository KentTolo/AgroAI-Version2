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
import { useCrops } from '@/lib/queries'

const CATEGORY_LABELS: Record<string, string> = {
  cereal: 'Cereals',
  legume: 'Legumes',
  fruit: 'Fruit',
  fibre: 'Fibre',
  plantation: 'Plantation',
}

export default function CropsPage() {
  const crops = useCrops()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

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
        description="The 22 crops AgroAI knows, with the conditions each one was observed growing best in."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((crop) => (
            <Link
              key={crop.slug}
              to={`/app/crops/${crop.slug}`}
              className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-fg/30"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-medium group-hover:underline decoration-highlight decoration-2 underline-offset-4">{crop.name}</h2>
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
