/** Minimal typed client for the AgroAI API. */

import type {
  AdminOverview,
  AdminUserRow,
  Advisory,
  Device,
  DeviceWithKey,
  SensorSummary,
  Telemetry,
  Climate,
  DailyWeather,
  WeatherSyncResult,
  Crop,
  CropCycle,
  CycleStatus,
  Dashboard,
  Field,
  FieldInput,
  GrowingConditions,
  ModelInfo,
  Page,
  Reading,
  Recommendation,
  RecommendationScope,
  Token,
  User,
} from './types'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1'

/** The GitHub Pages build has no server: requests are answered in the browser instead. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

/** Absolute API base URL, for configuring sensor firmware. */
export function apiBaseUrl(): string {
  return new URL(BASE_URL, window.location.origin).toString().replace(/\/$/, '')
}
const TOKEN_KEY = 'agroai.token'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Notified when the API rejects the stored token, so the app can sign the user out. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable (private mode); the session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

interface ValidationIssue {
  loc?: (string | number)[]
  msg?: string
}

function describeError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return (detail as ValidationIssue[])
      .map((issue) => {
        const field = issue.loc?.filter((part) => part !== 'body').join('.')
        const msg = (issue.msg ?? 'Invalid value').replace(/^Value error, /, '')
        return field ? `${field}: ${msg}` : msg
      })
      .join('; ')
  }
  return fallback
}

type Query = Record<string, string | number | undefined | null>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  form?: Record<string, string>
  query?: Query
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, query } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  if (DEMO_MODE) {
    const { handleDemoRequest } = await import('@/demo/server')
    try {
      return (await handleDemoRequest({ method, path, token, body, form, query })) as T
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && token) onUnauthorized?.()
      throw err
    }
  }

  let payload: BodyInit | undefined
  if (form) {
    payload = new URLSearchParams(form)
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }

  let url = `${BASE_URL}${path}`
  if (query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
    }
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }

  let response: Response
  try {
    response = await fetch(url, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'Cannot reach the AgroAI server. Check your connection and try again.')
  }

  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized?.()
    const detail = (data as { detail?: unknown } | null)?.detail
    throw new ApiError(response.status, describeError(detail, `Request failed (${response.status})`))
  }
  return data as T
}

export interface ReadingsQuery {
  since?: string
  limit?: number
}

export interface CycleInput {
  crop: string
  planted_on: string
  expected_harvest_on?: string | null
  notes?: string | null
}

export interface CycleUpdate {
  status?: CycleStatus
  harvested_on?: string | null
  yield_kg?: number | null
  notes?: string | null
  expected_harvest_on?: string
}

export const api = {
  login: (email: string, password: string) =>
    request<Token>('/auth/login', { method: 'POST', form: { username: email, password } }),
  register: (input: { email: string; full_name: string; password: string }) =>
    request<User>('/auth/register', { method: 'POST', body: input }),

  me: () => request<User>('/users/me'),
  updateMe: (input: { full_name: string }) =>
    request<User>('/users/me', { method: 'PATCH', body: input }),
  changePassword: (input: { current_password: string; new_password: string }) =>
    request<void>('/users/me/password', { method: 'POST', body: input }),
  deleteMe: () => request<void>('/users/me', { method: 'DELETE' }),

  dashboard: () => request<Dashboard>('/dashboard'),

  fields: () => request<Page<Field>>('/fields', { query: { limit: 200 } }),
  field: (id: string) => request<Field>(`/fields/${id}`),
  createField: (input: FieldInput) => request<Field>('/fields', { method: 'POST', body: input }),
  updateField: (id: string, input: Partial<FieldInput>) =>
    request<Field>(`/fields/${id}`, { method: 'PATCH', body: input }),
  deleteField: (id: string) => request<void>(`/fields/${id}`, { method: 'DELETE' }),

  readings: (fieldId: string, query: ReadingsQuery = {}) =>
    request<Page<Reading>>(`/fields/${fieldId}/readings`, { query: { ...query } }),
  addReading: (fieldId: string, input: GrowingConditions & { recorded_at?: string }) =>
    request<Reading>(`/fields/${fieldId}/readings`, { method: 'POST', body: input }),
  simulateReadings: (fieldId: string, days: number) =>
    request<Page<Reading>>(`/fields/${fieldId}/readings/simulate`, {
      method: 'POST',
      body: { days },
    }),
  clearReadings: (fieldId: string) =>
    request<void>(`/fields/${fieldId}/readings`, { method: 'DELETE' }),

  cycles: (query: { status?: CycleStatus; field_id?: string } = {}) =>
    request<Page<CropCycle>>('/cycles', { query: { ...query, limit: 200 } }),
  startCycle: (fieldId: string, input: CycleInput) =>
    request<CropCycle>(`/fields/${fieldId}/cycles`, { method: 'POST', body: input }),
  updateCycle: (id: string, input: CycleUpdate) =>
    request<CropCycle>(`/cycles/${id}`, { method: 'PATCH', body: input }),
  deleteCycle: (id: string) => request<void>(`/cycles/${id}`, { method: 'DELETE' }),

  recommend: (input: {
    conditions?: GrowingConditions
    field_id?: string | null
    top_k?: number
    climate_basis?: string | null
    scope?: RecommendationScope
  }) => request<Recommendation>('/recommendations', { method: 'POST', body: input }),
  recommendations: (query: { field_id?: string; limit?: number; offset?: number } = {}) =>
    request<Page<Recommendation>>('/recommendations', { query: { ...query } }),
  recommendation: (id: string) => request<Recommendation>(`/recommendations/${id}`),
  deleteRecommendation: (id: string) =>
    request<void>(`/recommendations/${id}`, { method: 'DELETE' }),

  advise: (input: { crop: string; conditions: GrowingConditions }) =>
    request<Advisory>('/advisory', { method: 'POST', body: input }),

  forecast: (fieldId: string, days = 7) =>
    request<DailyWeather[]>(`/fields/${fieldId}/weather/forecast`, { query: { days } }),
  weatherHistory: (fieldId: string, since?: string) =>
    request<DailyWeather[]>(`/fields/${fieldId}/weather`, { query: { since } }),
  syncWeather: (fieldId: string, years = 3) =>
    request<WeatherSyncResult>(`/fields/${fieldId}/weather/sync`, { method: 'POST', body: { years } }),
  climate: (fieldId: string, season?: { start: number; months: number }) =>
    request<Climate>(`/fields/${fieldId}/weather/climate`, {
      query: { season_start: season?.start, season_months: season?.months },
    }),

  devices: (fieldId: string) => request<Device[]>(`/fields/${fieldId}/devices`),
  registerDevice: (fieldId: string, name: string) =>
    request<DeviceWithKey>(`/fields/${fieldId}/devices`, { method: 'POST', body: { name } }),
  rotateDeviceKey: (id: string) => request<DeviceWithKey>(`/devices/${id}/rotate-key`, { method: 'POST' }),
  deleteDevice: (id: string) => request<void>(`/devices/${id}`, { method: 'DELETE' }),
  telemetry: (fieldId: string, since?: string) =>
    request<Telemetry[]>(`/fields/${fieldId}/telemetry`, { query: { since } }),
  telemetrySummary: (fieldId: string, days = 7) =>
    request<SensorSummary>(`/fields/${fieldId}/telemetry/summary`, { query: { days } }),

  adminOverview: () => request<AdminOverview>('/admin/overview'),
  adminUsers: () => request<AdminUserRow[]>('/admin/users'),

  crops: () => request<Crop[]>('/crops'),
  crop: (slug: string) => request<Crop>(`/crops/${slug}`),
  model: () => request<ModelInfo>('/model'),
}
