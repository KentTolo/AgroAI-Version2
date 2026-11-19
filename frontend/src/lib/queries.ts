/** React Query hooks: one place for cache keys and invalidation rules. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CycleInput, type CycleUpdate } from './api'
import type { CycleStatus, FieldInput, GrowingConditions } from './types'

export const keys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  fields: ['fields'] as const,
  field: (id: string) => ['fields', id] as const,
  readings: (id: string, since?: string) => ['fields', id, 'readings', since ?? 'all'] as const,
  cycles: (filter: object = {}) => ['cycles', filter] as const,
  recommendations: (filter: object = {}) => ['recommendations', filter] as const,
  crops: ['crops'] as const,
  crop: (slug: string) => ['crops', slug] as const,
  model: ['model'] as const,
  weather: (id: string) => ['weather', id] as const,
}

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: api.dashboard })
export const useFields = () => useQuery({ queryKey: keys.fields, queryFn: api.fields })
export const useField = (id: string) =>
  useQuery({ queryKey: keys.field(id), queryFn: () => api.field(id) })
export const useReadings = (id: string, since?: string) =>
  useQuery({
    queryKey: keys.readings(id, since),
    queryFn: () => api.readings(id, { since, limit: 2000 }),
  })
export const useCycles = (filter: { status?: CycleStatus; field_id?: string } = {}) =>
  useQuery({ queryKey: keys.cycles(filter), queryFn: () => api.cycles(filter) })
export const useRecommendations = (filter: { field_id?: string; limit?: number; offset?: number } = {}) =>
  useQuery({ queryKey: keys.recommendations(filter), queryFn: () => api.recommendations(filter) })
export const useCrops = () =>
  useQuery({ queryKey: keys.crops, queryFn: api.crops, staleTime: Infinity })
export const useCrop = (slug: string) =>
  useQuery({ queryKey: keys.crop(slug), queryFn: () => api.crop(slug), staleTime: Infinity })
export const useModelInfo = () =>
  useQuery({ queryKey: keys.model, queryFn: api.model, staleTime: Infinity, retry: false })

/** Invalidate everything derived from a user's fields. */
function useInvalidateFarm() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.fields }),
      client.invalidateQueries({ queryKey: ['cycles'] }),
      client.invalidateQueries({ queryKey: keys.dashboard }),
    ])
}

export function useCreateField() {
  const invalidate = useInvalidateFarm()
  return useMutation({ mutationFn: (input: FieldInput) => api.createField(input), onSuccess: invalidate })
}

export function useUpdateField(id: string) {
  const invalidate = useInvalidateFarm()
  return useMutation({
    mutationFn: (input: Partial<FieldInput>) => api.updateField(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteField() {
  const invalidate = useInvalidateFarm()
  return useMutation({ mutationFn: (id: string) => api.deleteField(id), onSuccess: invalidate })
}

export function useAddReading(fieldId: string) {
  const invalidate = useInvalidateFarm()
  return useMutation({
    mutationFn: (input: GrowingConditions & { recorded_at?: string }) =>
      api.addReading(fieldId, input),
    onSuccess: invalidate,
  })
}

export function useSimulateReadings(fieldId: string) {
  const invalidate = useInvalidateFarm()
  return useMutation({
    mutationFn: (days: number) => api.simulateReadings(fieldId, days),
    onSuccess: invalidate,
  })
}

export function useClearReadings(fieldId: string) {
  const invalidate = useInvalidateFarm()
  return useMutation({ mutationFn: () => api.clearReadings(fieldId), onSuccess: invalidate })
}

export function useStartCycle(fieldId: string) {
  const invalidate = useInvalidateFarm()
  return useMutation({
    mutationFn: (input: CycleInput) => api.startCycle(fieldId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateCycle() {
  const invalidate = useInvalidateFarm()
  return useMutation({
    mutationFn: ({ id, ...input }: CycleUpdate & { id: string }) => api.updateCycle(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteCycle() {
  const invalidate = useInvalidateFarm()
  return useMutation({ mutationFn: (id: string) => api.deleteCycle(id), onSuccess: invalidate })
}

export function useRecommend() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.recommend,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['recommendations'] }),
        client.invalidateQueries({ queryKey: keys.dashboard }),
      ]),
  })
}

export function useDeleteRecommendation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteRecommendation(id),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['recommendations'] }),
        client.invalidateQueries({ queryKey: keys.dashboard }),
      ]),
  })
}

export const useAdvise = () => useMutation({ mutationFn: api.advise })

/* ---------- Weather ---------- */

export const useForecast = (fieldId: string, enabled = true) =>
  useQuery({
    queryKey: [...keys.weather(fieldId), 'forecast'],
    queryFn: () => api.forecast(fieldId),
    enabled,
    staleTime: 30 * 60_000,
    retry: 1,
  })

export const useWeatherHistory = (fieldId: string, since: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...keys.weather(fieldId), 'history', since ?? 'all'],
    queryFn: () => api.weatherHistory(fieldId, since),
    enabled,
  })

export const useClimate = (
  fieldId: string,
  season: { start: number; months: number } | undefined,
  enabled = true,
) =>
  useQuery({
    queryKey: [...keys.weather(fieldId), 'climate', season?.start ?? 0, season?.months ?? 0],
    queryFn: () => api.climate(fieldId, season),
    enabled,
  })

export function useSyncWeather(fieldId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (years: number = 3) => api.syncWeather(fieldId, years),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.weather(fieldId) }),
  })
}

/* ---------- Sensors ---------- */

export const sensorKeys = (fieldId: string) => ['sensors', fieldId] as const

export const useDevices = (fieldId: string) =>
  useQuery({ queryKey: [...sensorKeys(fieldId), 'devices'], queryFn: () => api.devices(fieldId), refetchInterval: 60_000 })

export const useTelemetry = (fieldId: string, since: string, enabled = true) =>
  useQuery({
    queryKey: [...sensorKeys(fieldId), 'telemetry', since],
    queryFn: () => api.telemetry(fieldId, since),
    enabled,
    refetchInterval: 60_000,
  })

export const useSensorSummary = (fieldId: string, days: number, enabled = true) =>
  useQuery({
    queryKey: [...sensorKeys(fieldId), 'summary', days],
    queryFn: () => api.telemetrySummary(fieldId, days),
    enabled,
  })

function useInvalidateSensors(fieldId: string) {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: sensorKeys(fieldId) })
}

export function useRegisterDevice(fieldId: string) {
  const invalidate = useInvalidateSensors(fieldId)
  return useMutation({ mutationFn: (name: string) => api.registerDevice(fieldId, name), onSuccess: invalidate })
}

export function useRotateDeviceKey(fieldId: string) {
  const invalidate = useInvalidateSensors(fieldId)
  return useMutation({ mutationFn: (id: string) => api.rotateDeviceKey(id), onSuccess: invalidate })
}

export function useDeleteDevice(fieldId: string) {
  const invalidate = useInvalidateSensors(fieldId)
  return useMutation({ mutationFn: (id: string) => api.deleteDevice(id), onSuccess: invalidate })
}
