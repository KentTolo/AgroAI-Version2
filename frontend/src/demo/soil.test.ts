import { describe, expect, it } from 'vitest'
import { soilDefaults, toModelUnits, type SoilData } from './soil'

const conversion = {
  source: 'iSDAsoil (CC BY 4.0), topsoil 0–20 cm',
  mineralisable_n_fraction: 0.02,
  sufficient_potassium_ppm: 120,
  training_median_potassium: 32,
  search_radius: 2,
}
const bounds = {
  nitrogen: { min: 0, max: 140 },
  phosphorus: { min: 5, max: 145 },
  potassium: { min: 5, max: 205 },
  ph: { min: 3.5, max: 9.9 },
}
const lab = { ph: 6.2, nitrogen_total_g_kg: 1.5, phosphorus_ppm: 10, potassium_ppm: 60, bulk_density_g_cm3: 1.3 }

describe('soil defaults (mirrors app/services/soil.py)', () => {
  it('converts laboratory values to kg/ha like the API', () => {
    const { values, notes } = toModelUnits(lab, { conversion }, bounds)
    expect(values).toEqual({ nitrogen: 78, phosphorus: 26, potassium: 156, ph: 6.2 })
    expect(notes).toEqual([])
  })

  it('gives plentiful potassium the training median', () => {
    const { values, notes } = toModelUnits({ ...lab, potassium_ppm: 160 }, { conversion }, bounds)
    expect(values.potassium).toBe(32)
    expect(notes[0]).toMatch(/plentiful/)
  })

  it('finds the grid cell for a location and falls back to national values', () => {
    const data: SoilData = {
      conversion,
      national: { ...lab, pixels: 1 },
      districts: {},
      grid: {
        origin: [-30, 27],
        cell_degrees: 0.05,
        columns: ['row', 'col', 'district', 'ph', 'nitrogen_total_g_kg', 'phosphorus_ppm', 'potassium_ppm', 'bulk_density_g_cm3'],
        district_names: ['Berea', 'Maseru'],
        cells: [[13, 9, 1, 6.5, 1.0, 9, 140, 1.3]],
      },
    }
    const local = soilDefaults(data, bounds, -29.31, 27.48)
    expect(local).toMatchObject({ scope: 'local', district: 'Maseru', ph: 6.5, phosphorus: 23.4 })
    expect(soilDefaults(data, bounds, -26.2, 28.05).scope).toBe('national')
    expect(soilDefaults(data, bounds, null, null).ph).toBe(6.2)
  })
})
