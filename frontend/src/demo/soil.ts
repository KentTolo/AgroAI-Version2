/**
 * Browser port of app/services/soil.py: typical topsoil values for a location, from the iSDAsoil
 * grid exported into knowledge.json. Keep the two in step (the tests check the shared maths).
 */
import type { SoilDefaults } from '@/lib/types'

type Lab = SoilDefaults['lab']

export interface SoilData {
  grid: {
    origin: [number, number]
    cell_degrees: number
    columns: string[]
    district_names: string[]
    cells: number[][]
  }
  national: Lab & Record<string, number>
  districts: Record<string, Lab & Record<string, number>>
  conversion: {
    source: string
    mineralisable_n_fraction: number
    sufficient_potassium_ppm: number
    training_median_potassium: number
    search_radius: number
  }
}

type Bounds = Record<'nitrogen' | 'phosphorus' | 'potassium' | 'ph', { min: number; max: number }>

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

function labFrom(record: Record<string, number>): Lab {
  return {
    ph: record.ph ?? 0,
    nitrogen_total_g_kg: record.nitrogen_total_g_kg ?? 0,
    phosphorus_ppm: record.phosphorus_ppm ?? 0,
    potassium_ppm: record.potassium_ppm ?? 0,
    bulk_density_g_cm3: record.bulk_density_g_cm3 ?? 0,
  }
}

export function toModelUnits(lab: Lab, data: Pick<SoilData, 'conversion'>, bounds: Bounds) {
  const c = data.conversion
  const perPpm = lab.bulk_density_g_cm3 * 2
  const raw: Record<string, number> = {
    nitrogen: lab.nitrogen_total_g_kg * 1000 * perPpm * c.mineralisable_n_fraction,
    phosphorus: lab.phosphorus_ppm * perPpm,
    potassium: lab.potassium_ppm * perPpm,
    ph: lab.ph,
  }
  const values: Record<string, number> = {}
  const notes: string[] = []
  if (lab.potassium_ppm >= c.sufficient_potassium_ppm) {
    values.potassium = c.training_median_potassium
    notes.push(
      `Potassium is plentiful here (${lab.potassium_ppm.toFixed(0)} mg/kg, about ${(raw.potassium ?? 0).toFixed(0)} kg/ha; ` +
        `crops need around ${c.sufficient_potassium_ppm.toFixed(0)} mg/kg), so it is not limiting. The model is given its ` +
        `typical value (${c.training_median_potassium.toFixed(0)} kg/ha) so potassium doesn't skew the ranking.`,
    )
    delete raw.potassium
  }
  for (const [key, value] of Object.entries(raw)) {
    const { min, max } = bounds[key as keyof Bounds]
    const capped = Math.min(Math.max(value, min), max)
    values[key] = round(capped, key === 'ph' ? 2 : 1)
    if (capped !== value) {
      notes.push(
        `${key[0]?.toUpperCase()}${key.slice(1)} here is about ${value.toFixed(0)} kg/ha, beyond the model's training range, ` +
          `so ${capped.toFixed(0)} kg/ha (its ${value > max ? 'maximum' : 'minimum'}) is used.`,
      )
    }
  }
  return { values: values as Record<keyof Bounds, number>, notes }
}

export function soilDefaults(data: SoilData, bounds: Bounds, latitude: number | null, longitude: number | null): SoilDefaults {
  const { grid } = data
  const idx = Object.fromEntries(grid.columns.map((name, i) => [name, i]))
  let lab = labFrom(data.national)
  let district: string | null = null
  if (latitude !== null && longitude !== null) {
    const i = Math.floor((latitude - grid.origin[0]) / grid.cell_degrees)
    const j = Math.floor((longitude - grid.origin[1]) / grid.cell_degrees)
    const r = data.conversion.search_radius
    let best: { d: number; cell: number[] } | null = null
    for (const cell of grid.cells) {
      const di = (cell[idx.row ?? 0] ?? 0) - i
      const dj = (cell[idx.col ?? 1] ?? 0) - j
      if (Math.abs(di) > r || Math.abs(dj) > r) continue
      const d = di * di + dj * dj
      if (!best || d < best.d) best = { d, cell }
    }
    if (best) {
      const record = Object.fromEntries(grid.columns.map((name, k) => [name, best.cell[k] ?? 0]))
      lab = labFrom(record)
      district = grid.district_names[record.district ?? 0] ?? null
    }
  }
  const { values, notes } = toModelUnits(lab, data, bounds)
  return {
    scope: district ? 'local' : 'national',
    district,
    description: district
      ? `Typical topsoil within about 5 km of this spot (${district} district)`
      : "Typical topsoil across Lesotho (add the field's location for local values)",
    source: data.conversion.source,
    lab,
    ...values,
    notes,
  }
}
