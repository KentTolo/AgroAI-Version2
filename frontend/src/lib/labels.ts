import type { Tone } from '@/components/ui/Feedback'
import type { Severity, Verdict } from './types'

/** How sure the model is, in words. Vote shares are not calibrated probabilities. */
export function confidenceLabel(probability: number): { label: string; tone: Tone } {
  if (probability >= 0.7) return { label: 'High confidence', tone: 'success' }
  if (probability >= 0.4) return { label: 'Moderate confidence', tone: 'warning' }
  return { label: 'Low confidence', tone: 'danger' }
}

export const VERDICTS: Record<Verdict, { label: string; tone: Tone }> = {
  well_suited: { label: 'Well suited', tone: 'success' },
  suitable_with_adjustments: { label: 'Suitable with adjustments', tone: 'info' },
  marginal: { label: 'Marginal', tone: 'warning' },
  not_recommended: { label: 'Not recommended', tone: 'danger' },
}

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  optimal: { label: 'Optimal', tone: 'success' },
  slight: { label: 'Slightly off', tone: 'info' },
  moderate: { label: 'Moderately off', tone: 'warning' },
  significant: { label: 'Far off', tone: 'danger' },
}
