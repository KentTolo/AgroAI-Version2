import { lazy, Suspense } from 'react'
import { clsx } from 'clsx'
import type { MapPoint } from '@/lib/map'

export interface FieldMapProps {
  points: MapPoint[]
  className?: string
  onSelect?: (id: string) => void
  /** When set, clicking the map (or "find my location") picks a location. */
  onPick?: (lat: number, lng: number) => void
  zoom?: number
}

// The map library is large, so it loads only when a map is on screen.
const FieldMapCanvas = lazy(() => import('./FieldMapCanvas'))

export function FieldMap(props: FieldMapProps) {
  return (
    <Suspense fallback={<div className={clsx('animate-pulse rounded-lg border border-line bg-surface-muted', props.className)} aria-hidden />}>
      <FieldMapCanvas {...props} />
    </Suspense>
  )
}
