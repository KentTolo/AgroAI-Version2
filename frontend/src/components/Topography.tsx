import { clsx } from 'clsx'
import { useMemo } from 'react'

/**
 * Decorative topographic contour lines, generated deterministically so they render the same
 * every time. Colour comes from `currentColor`.
 */
export function Topography({
  className,
  rings = 14,
  seed = 3,
}: {
  className?: string
  rings?: number
  seed?: number
}) {
  const paths = useMemo(() => {
    const result: string[] = []
    const cx = 400
    const cy = 260
    for (let r = 0; r < rings; r++) {
      const base = 40 + r * 34
      const points: string[] = []
      const steps = 72
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2
        const wobble =
          Math.sin(t * 3 + seed + r * 0.35) * (8 + r * 1.6) +
          Math.sin(t * 5 - seed * 0.7 + r * 0.2) * (4 + r * 0.8) +
          Math.cos(t * 2 + r * 0.15) * r * 2.2
        const radius = base + wobble
        const x = cx + Math.cos(t) * radius * 1.35
        const y = cy + Math.sin(t) * radius * 0.85
        points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      }
      result.push(`${points.join(' ')}Z`)
    }
    return result
  }, [rings, seed])

  return (
    <svg
      viewBox="0 0 800 520"
      preserveAspectRatio="xMidYMid slice"
      className={clsx('pointer-events-none', className)}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
          opacity={i % 4 === 0 ? 0.55 : 0.3}
        />
      ))}
    </svg>
  )
}
