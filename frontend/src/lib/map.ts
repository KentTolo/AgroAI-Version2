/** Maseru, used when there is nothing else to centre on. */
export const DEFAULT_CENTER: [number, number] = [-29.31, 27.48]

export interface MapPoint {
  id: string
  name: string
  latitude: number
  longitude: number
}

export function toMapPoints(
  fields: { id: string; name: string; latitude: number | null; longitude: number | null }[],
): MapPoint[] {
  return fields.flatMap((f) =>
    f.latitude !== null && f.longitude !== null
      ? [{ id: f.id, name: f.name, latitude: f.latitude, longitude: f.longitude }]
      : [],
  )
}
