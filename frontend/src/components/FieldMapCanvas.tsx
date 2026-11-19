import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { MapPinOff } from 'lucide-react'
import { DEFAULT_CENTER, type MapPoint } from '@/lib/map'
import type { FieldMapProps } from './FieldMap'

/*
 * Free, keyless base maps (the same open sources the God's Eye View project uses):
 * - Map: OpenFreeMap vector tiles, built from OpenStreetMap data (ODbL).
 * - Satellite: Esri World Imagery, the public tile service, with its required credit.
 */
const ESRI_TILES = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [ESRI_TILES],
      tileSize: 256,
      maxzoom: 18,
      attribution:
        'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> · Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
}

const BASEMAPS = {
  map: { label: 'Map', style: 'https://tiles.openfreemap.org/styles/liberty' as string | StyleSpecification },
  satellite: { label: 'Satellite', style: SATELLITE_STYLE as string | StyleSpecification },
}
type Basemap = keyof typeof BASEMAPS

const STORAGE_KEY = 'agroai.basemap'
function savedBasemap(fallback: Basemap): Basemap {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'map' || value === 'satellite' ? value : fallback
  } catch {
    return fallback
  }
}

/** Moves the map to show every point: one point close up, several fitted together. */
function frame(map: MapLibreMap, points: MapPoint[], animate: boolean) {
  if (points.length === 0) return
  const duration = animate ? 600 : 0
  if (points.length === 1) {
    const [p] = points
    if (p) map.easeTo({ center: [p.longitude, p.latitude], zoom: 14, duration })
    return
  }
  const bounds = new maplibregl.LngLatBounds()
  for (const p of points) bounds.extend([p.longitude, p.latitude])
  map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration })
}

/** A map button that brings every field back into view. */
class FitControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null
  private readonly onFit: () => void
  constructor(onFit: () => void) {
    this.onFit = onFit
  }
  onAdd() {
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group'
    const button = document.createElement('button')
    button.type = 'button'
    button.title = 'Show all fields'
    button.setAttribute('aria-label', 'Show all fields')
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin:auto" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/><circle cx="12" cy="12" r="2.5"/></svg>'
    button.addEventListener('click', this.onFit)
    container.appendChild(button)
    this.container = container
    return container
  }
  onRemove() {
    this.container?.remove()
    this.container = null
  }
}

// After the page itself scrolled this recently, a wheel over the map keeps scrolling the page
// instead of zooming, so scrolling past a map never gets "stuck" on it.
const PAGE_SCROLL_GRACE_MS = 600

function markerElement(point: MapPoint, clickable: boolean): HTMLElement {
  const el = document.createElement(clickable ? 'button' : 'span')
  el.className = 'agro-marker'
  el.setAttribute('aria-label', point.name)
  if (clickable) (el as HTMLButtonElement).type = 'button'
  return el
}

export default function FieldMapCanvas({ points, className, onSelect, onPick, zoom = 9 }: FieldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const handlers = useRef({ onSelect, onPick })
  handlers.current = { onSelect, onPick }
  const pointsRef = useRef(points)
  pointsRef.current = points
  const [basemap, setBasemap] = useState<Basemap>(() => savedBasemap(onPick ? 'satellite' : 'map'))
  const [failed, setFailed] = useState(false)

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const first = points[0]
    // Touch screens: one finger scrolls the page and two fingers move the map (as in most
    // embedded maps). In the location picker the map is the whole point, so one finger moves it.
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container,
        style: BASEMAPS[basemap].style,
        center: first ? [first.longitude, first.latitude] : [DEFAULT_CENTER[1], DEFAULT_CENTER[0]],
        zoom,
        maxZoom: 19,
        cooperativeGestures: touch && !onPick,
        attributionControl: { compact: true },
      })
    } catch {
      // No WebGL (old browser or disabled graphics acceleration).
      setFailed(true)
      return
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.scrollZoom.setWheelZoomRate(1 / 300) // a notch of the wheel zooms a little faster
    if (!onPick) map.addControl(new FitControl(() => frame(map, pointsRef.current, true)), 'top-left')
    if (handlers.current.onPick) {
      const locate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false })
      locate.on('geolocate', (event: GeolocationPosition) => {
        handlers.current.onPick?.(Number(event.coords.latitude.toFixed(5)), Number(event.coords.longitude.toFixed(5)))
      })
      map.addControl(locate, 'top-left')
    }
    map.on('click', (event) => {
      handlers.current.onPick?.(Number(event.lngLat.lat.toFixed(5)), Number(event.lngLat.lng.toFixed(5)))
    })
    // Desktop: the mouse wheel zooms the map directly (no Ctrl key), unless the page was just
    // scrolling, in which case the page keeps scrolling past the map.
    let lastPageScroll = 0
    const onPageScroll = () => {
      lastPageScroll = performance.now()
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return // trackpad pinch: always zoom
      if (performance.now() - lastPageScroll < PAGE_SCROLL_GRACE_MS) event.stopPropagation()
    }
    const guardWheel = !touch && !onPick
    if (guardWheel) {
      window.addEventListener('scroll', onPageScroll, { passive: true, capture: true })
      container.addEventListener('wheel', onWheel, { capture: true })
    }
    // Maps in dialogs and collapsible cards change size without a window resize.
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)
    mapRef.current = map
    return () => {
      if (guardWheel) {
        window.removeEventListener('scroll', onPageScroll, { capture: true })
        container.removeEventListener('wheel', onWheel, { capture: true })
      }
      observer.disconnect()
      markersRef.current = []
      mapRef.current = null
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; later changes are applied below
  }, [])

  // Base map switch. DOM markers survive a style change.
  useEffect(() => {
    mapRef.current?.setStyle(BASEMAPS[basemap].style)
    try {
      localStorage.setItem(STORAGE_KEY, basemap)
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [basemap])

  // Markers and framing.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = points.map((point) => {
      const clickable = Boolean(handlers.current.onSelect)
      const el = markerElement(point, clickable)
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'agro-tip' }).setText(point.name)
      const marker = new maplibregl.Marker({ element: el }).setLngLat([point.longitude, point.latitude]).setPopup(popup).addTo(map)
      const show = () => !popup.isOpen() && marker.togglePopup()
      const hide = () => popup.isOpen() && marker.togglePopup()
      el.addEventListener('mouseenter', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('focus', show)
      el.addEventListener('blur', hide)
      el.addEventListener('click', (event) => {
        event.stopPropagation() // not a location pick
        handlers.current.onSelect?.(point.id)
      })
      return marker
    })

    if (points.length === 0) return
    if (onPick) {
      // Picking: only move when the chosen point is out of view (e.g. typed coordinates).
      const [p] = points
      if (p && !map.getBounds().contains([p.longitude, p.latitude])) {
        map.jumpTo({ center: [p.longitude, p.latitude], zoom: Math.max(map.getZoom(), 13) })
      }
      return
    }
    frame(map, points, false)
  }, [points, onPick])

  if (failed) {
    return (
      <div className={clsx('flex flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-muted p-4 text-center text-sm text-fg-subtle', className)}>
        <MapPinOff className="size-5" aria-hidden />
        <p>The map needs WebGL, which this browser has turned off.</p>
        {points.map((p) => (
          <p key={p.id} className="tabular-nums">
            {p.name}: {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className={clsx('relative overflow-hidden rounded-lg border border-line', className)}>
      <div ref={containerRef} className={clsx('agro-map h-full w-full', onPick && 'agro-map-pick')} role="region" aria-label="Map of fields" />
      <div className="absolute top-2.5 right-2.5 flex overflow-hidden rounded-md border border-line bg-surface text-xs font-medium shadow-sm" role="group" aria-label="Base map">
        {(Object.keys(BASEMAPS) as Basemap[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={basemap === key}
            onClick={() => setBasemap(key)}
            className={clsx('px-2.5 py-1.5 transition-colors', basemap === key ? 'bg-brand text-brand-fg' : 'text-fg hover:bg-surface-muted')}
          >
            {BASEMAPS[key].label}
          </button>
        ))}
      </div>
    </div>
  )
}
