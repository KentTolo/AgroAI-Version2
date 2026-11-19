import type { Tone } from '@/components/ui/Feedback'
import type { LesothoStatus, Severity, Verdict } from './types'

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

export const LESOTHO_STATUS: Record<LesothoStatus, { label: string; heading: string; description: string; tone: Tone }> = {
  staple: {
    label: 'Lesotho staple',
    heading: 'Lesotho staples',
    description: 'The main field crops grown across Lesotho.',
    tone: 'brand',
  },
  common: {
    label: 'Grown in Lesotho',
    heading: 'Also grown in Lesotho',
    description: 'Widely grown in gardens and on smaller plots.',
    tone: 'success',
  },
  possible: {
    label: 'Some zones',
    heading: 'Possible in some zones',
    description: 'Grown on a small scale, or suited to the warmer lowlands and the Senqu River Valley.',
    tone: 'info',
  },
  unsuitable: {
    label: 'Not suited to Lesotho',
    heading: 'Not suited to Lesotho',
    description: 'Tropical crops that need frost-free, humid conditions. Listed because the model knows them.',
    tone: 'neutral',
  },
}
