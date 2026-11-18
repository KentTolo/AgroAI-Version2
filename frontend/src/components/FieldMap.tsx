import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { clsx } from 'clsx'
import { DEFAULT_CENTER, type MapPoint } from '@/lib/map'


// A CSS marker avoids Leaflet's default image icons, which break under bundlers.
const markerIcon = (active: boolean) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--brand);border:3px solid #fff;box-shadow:0 1px 4px rgb(0 0 0 / .35);${active ? 'outline:3px solid var(--brand-soft);' : ''}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      const [p] = points
      if (p) map.setView([p.latitude, p.longitude], 13)
      return
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [32, 32] })
  }, [map, points])
  return null
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(Number(event.latlng.lat.toFixed(5)), Number(event.latlng.lng.toFixed(5)))
    },
  })
  return null
}

interface FieldMapProps {
  points: MapPoint[]
  className?: string
  onSelect?: (id: string) => void
  /** When set, clicking the map picks a location. */
  onPick?: (lat: number, lng: number) => void
  zoom?: number
}

export function FieldMap({ points, className, onSelect, onPick, zoom = 9 }: FieldMapProps) {
  const icon = useMemo(() => markerIcon(false), [])
  const first = points[0]
  const center: [number, number] = first ? [first.latitude, first.longitude] : DEFAULT_CENTER

  return (
    <div className={clsx('overflow-hidden rounded-lg border border-line', className)}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={false}
        className={clsx('h-full w-full', onPick && 'cursor-crosshair')}
        aria-label="Map of fields"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude, p.longitude]}
            icon={icon}
            eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              {p.name}
            </Tooltip>
          </Marker>
        ))}
        {!onPick && <FitBounds points={points} />}
        {onPick && <ClickToPick onPick={onPick} />}
      </MapContainer>
    </div>
  )
}
