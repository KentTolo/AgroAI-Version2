import type { GrowingConditions, ParameterKey } from './types'

export interface ParameterMeta {
  key: ParameterKey
  label: string
  short: string
  unit: string
  group: 'soil' | 'climate'
  min: number
  max: number
  step: number
  /** Chart colour, as a CSS colour value. */
  color: string
}

/** Mirrors backend/app/ml/features.py. */
export const PARAMETERS: readonly ParameterMeta[] = [
  { key: 'nitrogen', label: 'Nitrogen', short: 'N', unit: 'kg/ha', group: 'soil', min: 0, max: 300, step: 1, color: '#2f8a4f' },
  { key: 'phosphorus', label: 'Phosphorus', short: 'P', unit: 'kg/ha', group: 'soil', min: 0, max: 300, step: 1, color: '#b7791f' },
  { key: 'potassium', label: 'Potassium', short: 'K', unit: 'kg/ha', group: 'soil', min: 0, max: 300, step: 1, color: '#7c5cc4' },
  { key: 'ph', label: 'Soil pH', short: 'pH', unit: '', group: 'soil', min: 0, max: 14, step: 0.1, color: '#c2410c' },
  { key: 'temperature', label: 'Temperature', short: 'Temp', unit: '°C', group: 'climate', min: -20, max: 60, step: 0.1, color: '#dc2626' },
  { key: 'humidity', label: 'Humidity', short: 'RH', unit: '%', group: 'climate', min: 0, max: 100, step: 1, color: '#0e7490' },
  { key: 'rainfall', label: 'Rainfall', short: 'Rain', unit: 'mm', group: 'climate', min: 0, max: 1000, step: 1, color: '#1d5fa6' },
]

export const PARAMETER_BY_KEY = Object.fromEntries(PARAMETERS.map((p) => [p.key, p])) as Record<
  ParameterKey,
  ParameterMeta
>

export function pickConditions(source: GrowingConditions): GrowingConditions {
  return Object.fromEntries(PARAMETERS.map((p) => [p.key, source[p.key]])) as GrowingConditions
}

/** A worked example (the classic rice-growing sample from the dataset). */
export const EXAMPLE_CONDITIONS: GrowingConditions = {
  nitrogen: 90,
  phosphorus: 42,
  potassium: 43,
  temperature: 20.9,
  humidity: 82,
  ph: 6.5,
  rainfall: 203,
}
