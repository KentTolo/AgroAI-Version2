import type { GrowingConditions, SoilDefaults } from './types'

export type SoilPatch = Pick<GrowingConditions, 'nitrogen' | 'phosphorus' | 'potassium' | 'ph'>

export const soilPatch = (d: SoilDefaults): SoilPatch => ({
  nitrogen: d.nitrogen,
  phosphorus: d.phosphorus,
  potassium: d.potassium,
  ph: d.ph,
})
