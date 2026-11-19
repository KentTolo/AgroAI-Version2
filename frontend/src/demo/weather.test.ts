import { describe, expect, it } from 'vitest'
import { addDays, monthlyNormals, parseDaily, recentSummaries, seasonClimate, summarise, type WeatherDay } from './engine'

/** Same seasonal cycle as the backend's FakeWeather fixture. */
function day(iso: string): WeatherDay {
  const date = new Date(`${iso}T00:00:00Z`)
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const yday = Math.round((date.getTime() - start) / 86_400_000)
  const phase = Math.cos((2 * Math.PI * (yday - 15)) / 365)
  return {
    day: iso,
    temperature_mean: Math.round((15 + 7 * phase) * 10) / 10,
    temperature_min: null,
    temperature_max: null,
    precipitation: date.getUTCDate() % 3 ? Math.round(Math.max(0, 2.5 * phase + 1) * 10) / 10 : 0,
    humidity_mean: Math.round((55 + 15 * phase) * 10) / 10,
    source: 'archive',
  }
}
const range = (start: string, end: string) => {
  const out: WeatherDay[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(day(d))
  return out
}

describe('weather', () => {
  it('parses Open-Meteo daily blocks', () => {
    const records = parseDaily(
      { daily: { time: ['2026-01-01', '2026-01-02', '2026-01-03'], temperature_2m_mean: [20.5, null, null], temperature_2m_min: [12, 10, null], temperature_2m_max: [28, 20, null], precipitation_sum: [3.2, null, null] } },
      'archive',
    )
    expect(records.map((r) => r.day)).toEqual(['2026-01-01', '2026-01-02'])
    expect(records[1]?.temperature_mean).toBe(15)
    expect(records[1]?.precipitation).toBe(0)
  })

  it('expresses rainfall as a monthly rate', () => {
    const days = Array.from({ length: 15 }, (_, i) => ({ ...day(addDays('2026-01-01', i)), temperature_mean: 20, precipitation: 2, humidity_mean: 60 }))
    expect(summarise(days, 'x')).toMatchObject({ days: 15, temperature: 20, humidity: 60, rainfall: 60, total_rainfall: 30 })
  })

  it('only reports windows the history covers', () => {
    expect(recentSummaries(range('2026-03-23', '2026-06-30')).map((s) => s.label)).toEqual(['Last 30 days', 'Last 90 days'])
  })

  it('builds monthly normals and wrap-around seasons', () => {
    const normals = monthlyNormals(range('2023-01-01', '2025-12-31'))
    expect(normals.map((n) => n.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(normals[0]!.temperature).toBeGreaterThan(normals[6]!.temperature)
    expect(normals[0]!.years).toBe(3)
    const summer = seasonClimate(normals, 11, 4)
    expect(summer?.label).toBe('Typical Nov–Feb')
    expect(seasonClimate(monthlyNormals(range('2025-01-01', '2025-03-31')), 2, 4)).toBeNull()
  })
})
