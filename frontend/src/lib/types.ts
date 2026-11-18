/** Types mirroring the API's response and request schemas (see backend/app/schemas). */

export type ParameterKey =
  | 'nitrogen'
  | 'phosphorus'
  | 'potassium'
  | 'temperature'
  | 'humidity'
  | 'ph'
  | 'rainfall'

export type GrowingConditions = Record<ParameterKey, number>

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface User {
  id: string
  email: string
  full_name: string
  created_at: string
  last_login_at: string | null
}

export interface Token {
  access_token: string
  token_type: 'bearer'
  expires_in: number
}

export type ReadingSource = 'manual' | 'simulated' | 'device'

export interface Reading extends GrowingConditions {
  id: string
  field_id: string
  recorded_at: string
  source: ReadingSource
}

export interface Field {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  area_hectares: number | null
  soil_type: string | null
  notes: string | null
  created_at: string
  updated_at: string
  latest_reading: Reading | null
  active_cycle_count: number
}

export interface FieldInput {
  name: string
  latitude?: number | null
  longitude?: number | null
  area_hectares?: number | null
  soil_type?: string | null
  notes?: string | null
}

export interface CropPrediction {
  crop: string
  name: string
  probability: number
}

export interface Recommendation {
  id: string
  field_id: string | null
  created_at: string
  inputs: GrowingConditions
  recommended_crop: string
  predictions: CropPrediction[]
  model_version: string
  warnings: string[]
}

export type Severity = 'optimal' | 'slight' | 'moderate' | 'significant'
export type Verdict = 'well_suited' | 'suitable_with_adjustments' | 'marginal' | 'not_recommended'

export interface ParameterAssessment {
  parameter: ParameterKey
  label: string
  unit: string
  value: number
  optimal_min: number
  optimal_max: number
  typical: number
  severity: Severity
  direction: 'increase' | 'decrease' | null
  advice: string | null
}

export interface Advisory {
  crop: string
  crop_name: string
  score: number
  verdict: Verdict
  summary: string
  model_probability: number | null
  parameters: ParameterAssessment[]
}

export interface ParameterRange {
  min: number
  max: number
  optimal_min: number
  optimal_max: number
  typical: number
}

export interface Crop {
  slug: string
  name: string
  category: string
  lifecycle: 'annual' | 'perennial'
  days_to_harvest: number
  description: string
  requirements: Record<ParameterKey, ParameterRange>
}

export type CycleStatus = 'active' | 'harvested' | 'failed'

export interface Stage {
  name: string
  guidance: string
  start_day: number
  end_day: number
  status: 'completed' | 'current' | 'upcoming'
}

export interface CycleProgress {
  day: number
  total_days: number
  percent: number
  days_remaining: number
  current_stage: string
  stages: Stage[]
}

export interface CropCycle {
  id: string
  field_id: string
  field_name: string
  crop: string
  crop_name: string
  planted_on: string
  expected_harvest_on: string
  harvested_on: string | null
  status: CycleStatus
  yield_kg: number | null
  notes: string | null
  created_at: string
  progress: CycleProgress | null
}

export interface ModelInfo {
  version: string
  algorithm: string
  trained_at: string
  features: string[]
  classes: string[]
  metrics: {
    test?: { accuracy?: number; f1_macro?: number; log_loss?: number }
    [key: string]: unknown
  }
}

export interface Dashboard {
  field_count: number
  active_cycle_count: number
  recommendation_count: number
  reading_count: number
  recent_recommendations: Recommendation[]
  active_cycles: CropCycle[]
}
