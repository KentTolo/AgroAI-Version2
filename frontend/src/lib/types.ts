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
  is_admin: boolean
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
  grown_in_lesotho: boolean
}

export type RecommendationScope = 'lesotho' | 'all'

/** A Lesotho crop the model cannot rank, scored by the crop advisor instead. */
export interface CropSuitability {
  crop: string
  name: string
  score: number
  verdict: Verdict
}

export interface Recommendation {
  id: string
  field_id: string | null
  created_at: string
  inputs: GrowingConditions
  recommended_crop: string
  predictions: CropPrediction[]
  model_version: string
  climate_basis: string | null
  scope: RecommendationScope
  also_consider: CropSuitability[]
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
  lesotho: LesothoStatus
  /** False when the model has no training data for the crop (advisor only). */
  model_ranked: boolean
  requirements: Record<ParameterKey, ParameterRange>
}

export type LesothoStatus = 'staple' | 'common' | 'possible' | 'unsuitable'

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

export interface DailyWeather {
  day: string
  temperature_mean: number
  temperature_min: number | null
  temperature_max: number | null
  precipitation: number
  humidity_mean: number | null
  source: 'archive' | 'recent' | 'forecast'
}

export interface ClimateSummary {
  label: string
  start: string
  end: string
  days: number
  temperature: number
  humidity: number | null
  /** Average monthly rainfall, mm per 30 days. */
  rainfall: number
  total_rainfall: number
}

export interface MonthNormal {
  month: number
  temperature: number
  humidity: number | null
  rainfall: number | null
  years: number
}

export interface SeasonClimate {
  label: string
  start_month: number
  months: number
  temperature: number
  humidity: number | null
  rainfall: number
  years: number
}

export interface Climate {
  coverage: { start: string | null; end: string | null; days: number }
  recent: ClimateSummary[]
  normals: MonthNormal[]
  season: SeasonClimate | null
  attribution: string
}

export interface WeatherSyncResult {
  fetched: number
  total_days: number
  start: string | null
  end: string | null
}

export interface Telemetry {
  id: string
  device_id: string
  recorded_at: string
  air_temperature: number | null
  air_humidity: number | null
  soil_moisture: number | null
  soil_temperature: number | null
  battery_voltage: number | null
  signal_strength: number | null
}

export interface Device {
  id: string
  field_id: string
  name: string
  key_prefix: string
  created_at: string
  last_seen_at: string | null
  latest: Telemetry | null
}

export interface DeviceWithKey extends Device {
  api_key: string
}

export interface SensorSummary {
  days: number
  readings: number
  start: string | null
  end: string | null
  air_temperature: number | null
  air_humidity: number | null
  soil_moisture: number | null
  soil_temperature: number | null
}

export interface AdminOverview {
  users: number
  users_active_7d: number
  fields: number
  mapped_fields: number
  soil_readings: number
  devices: number
  devices_online: number
  telemetry_24h: number
  recommendations: number
  active_cycles: number
  weather_days: number
  signups: { day: string; count: number }[]
  recent_recommendations: {
    id: string
    created_at: string
    user_email: string
    field_name: string | null
    crop: string
    probability: number
    climate_basis: string | null
  }[]
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string
  is_admin: boolean
  created_at: string
  last_login_at: string | null
  fields: number
  soil_readings: number
  devices: number
  recommendations: number
}
