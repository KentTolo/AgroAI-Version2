/**
 * An in-browser stand-in for the AgroAI API, used by the GitHub Pages demo build.
 * It answers the same routes with the same JSON shapes, keeping all data in this browser's
 * localStorage. It is a demo, not a security boundary: passwords are hashed, but anyone with
 * access to the browser can read the stored data.
 */

import { ApiError } from '@/lib/api'
import type {
  CropCycle,
  CycleStatus,
  Field,
  GrowingConditions,
  ParameterKey,
  Reading,
  Recommendation,
  User,
} from '@/lib/types'
import {
  addDays,
  assess,
  fetchForecast,
  fetchHistory,
  monthlyNormals,
  recentSummaries,
  seasonClimate,
  type WeatherDay,
  computeProgress,
  generateSeries,
  isoDate,
  outOfRangeWarnings,
  rankCrops,
  type CropDef,
  type ForestModel,
  type Knowledge,
} from './engine'
import { DEMO_EMAIL, DEMO_PASSWORD } from './credentials'

const STORE_KEY = 'agroai.demo.v1'

interface StoredUser extends Omit<User, 'is_admin'> {
  password_hash: string
  salt: string
}
type StoredField = Omit<Field, 'latest_reading' | 'active_cycle_count'> & { owner_id: string }
type StoredCycle = Omit<CropCycle, 'field_name' | 'crop_name' | 'progress'>
type StoredRecommendation = Omit<Recommendation, 'warnings'> & { user_id: string }

interface Db {
  users: StoredUser[]
  sessions: Record<string, string>
  fields: StoredField[]
  readings: Reading[]
  cycles: StoredCycle[]
  recommendations: StoredRecommendation[]
  weather?: (WeatherDay & { field_id: string })[]
}

const emptyDb = (): Db => ({ users: [], sessions: {}, fields: [], readings: [], cycles: [], recommendations: [] })

let memoryDb: Db | null = null

function load(): Db {
  if (memoryDb) return memoryDb
  try {
    const raw = localStorage.getItem(STORE_KEY)
    memoryDb = raw ? { ...emptyDb(), ...(JSON.parse(raw) as Db) } : emptyDb()
  } catch {
    memoryDb = emptyDb()
  }
  return memoryDb
}

function save(db: Db) {
  memoryDb = db
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db))
  } catch {
    /* storage full or blocked: keep working in memory for this visit */
  }
}

export function resetDemoData() {
  memoryDb = null
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    /* ignore */
  }
}

/* ---------- Static assets ---------- */

let assets: Promise<{ model: ForestModel; knowledge: Knowledge }> | null = null

function loadAssets() {
  assets ??= (async () => {
    const base = import.meta.env.BASE_URL
    const [model, knowledge] = await Promise.all([
      fetch(`${base}demo/model.json`).then((r) => {
        if (!r.ok) throw new ApiError(503, 'The demo model could not be loaded.')
        return r.json() as Promise<ForestModel>
      }),
      fetch(`${base}demo/knowledge.json`).then((r) => {
        if (!r.ok) throw new ApiError(503, 'The demo data could not be loaded.')
        return r.json() as Promise<Knowledge>
      }),
    ])
    return { model, knowledge }
  })().catch((err: unknown) => {
    assets = null
    throw err
  })
  return assets
}

/* ---------- Helpers ---------- */

const now = () => new Date().toISOString()
const today = () => {
  const d = new Date()
  return isoDate(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}
const uuid = () => crypto.randomUUID()
const fail = (status: number, detail: string): never => {
  throw new ApiError(status, detail)
}

async function hash(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function checkPassword(password: string) {
  if (password.length < 8) fail(422, 'password: Use at least 8 characters')
  if (/^\d+$/.test(password) || /^[a-zA-Z]+$/.test(password))
    fail(422, 'password: Mix letters with numbers or symbols')
}

function pickConditions(source: Record<string, unknown>, keys: ParameterKey[]): GrowingConditions {
  const out = {} as GrowingConditions
  for (const key of keys) {
    const value = Number(source[key])
    if (!Number.isFinite(value)) fail(422, `${key}: Enter a number`)
    out[key] = value
  }
  return out
}

function page<T>(items: T[], limit: number, offset: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset }
}

const PUBLIC_USER = ({ id, email, full_name, created_at, last_login_at }: StoredUser): User => ({
  id,
  email,
  full_name,
  created_at,
  last_login_at,
  is_admin: false,
})

/* ---------- Seeding ---------- */

const SEED_FIELDS = [
  { name: 'Ha Foso lowland plot', latitude: -29.2675, longitude: 27.541, area_hectares: 1.8, soil_type: 'Loam', notes: 'Gentle slope, river nearby.', seed: 11 },
  { name: 'Roma valley terrace', latitude: -29.4485, longitude: 27.7239, area_hectares: 0.9, soil_type: 'Clay loam', notes: 'Terraced; holds water well.', seed: 23 },
  { name: 'Morija garden', latitude: -29.626, longitude: 27.505, area_hectares: 0.4, soil_type: 'Sandy loam', notes: 'Vegetables and legumes.', seed: 37 },
]
const SEED_CYCLES: [number, string, number, CycleStatus][] = [
  [0, 'maize', 46, 'active'],
  [1, 'kidneybeans', 18, 'active'],
  [2, 'chickpea', 70, 'active'],
  [0, 'lentil', 300, 'harvested'],
]

let seeding: Promise<void> | null = null

/** Create the demo account once, even when several requests arrive together. */
function ensureSeeded(db: Db) {
  if (db.users.some((u) => u.email === DEMO_EMAIL)) return Promise.resolve()
  seeding ??= seedDemoAccount(db)
    .then(() => save(db))
    .finally(() => {
      seeding = null
    })
  return seeding
}

async function seedDemoAccount(db: Db) {
  const { model, knowledge } = await loadAssets()
  const salt = uuid()
  const user: StoredUser = {
    id: uuid(),
    email: DEMO_EMAIL,
    full_name: 'Demo Farmer',
    created_at: now(),
    last_login_at: null,
    salt,
    password_hash: await hash(DEMO_PASSWORD, salt),
  }
  db.users.push(user)

  const fieldIds: string[] = []
  for (const f of SEED_FIELDS) {
    const id = uuid()
    fieldIds.push(id)
    const { seed, ...rest } = f
    db.fields.push({ id, owner_id: user.id, created_at: now(), updated_at: now(), ...rest })
    const series = generateSeries(knowledge, { end: Date.now(), count: 60, intervalMs: 86_400_000, seed })
    for (const point of series) {
      db.readings.push({ id: uuid(), field_id: id, recorded_at: new Date(point.recordedAt).toISOString(), source: 'simulated', ...point.values })
    }
    const latest = series[series.length - 1]
    if (latest) {
      const ranked = rankCrops(model, latest.values).slice(0, 5)
      db.recommendations.push({
        id: uuid(),
        user_id: user.id,
        field_id: id,
        created_at: now(),
        inputs: latest.values,
        predictions: ranked.map((s) => ({ crop: s.crop, name: cropName(knowledge, s.crop), probability: Math.round(s.probability * 1e4) / 1e4 })),
        recommended_crop: ranked[0]?.crop ?? '',
        model_version: model.version,
        climate_basis: null,
      })
    }
  }
  for (const [fieldIndex, slug, daysAgo, status] of SEED_CYCLES) {
    const crop = knowledge.crops.find((c) => c.slug === slug)
    if (!crop) continue
    const planted = addDays(today(), -daysAgo)
    const expected = addDays(planted, crop.days_to_harvest)
    db.cycles.push({
      id: uuid(),
      field_id: fieldIds[fieldIndex] as string,
      crop: slug,
      planted_on: planted,
      expected_harvest_on: expected,
      harvested_on: status === 'harvested' ? expected : null,
      status,
      yield_kg: status === 'harvested' ? 420 : null,
      notes: null,
      created_at: now(),
    })
  }
}

const cropName = (k: Knowledge, slug: string) =>
  k.crops.find((c) => c.slug === slug)?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1)

/* ---------- Request handling ---------- */

export interface DemoRequest {
  method: string
  path: string
  token: string | null
  body?: unknown
  form?: Record<string, string>
  query?: Record<string, string | number | undefined | null>
}

export async function handleDemoRequest({ method, path, token, body, form, query = {} }: DemoRequest): Promise<unknown> {
  const db = load()
  await ensureSeeded(db)
  const { model, knowledge } = await loadAssets()
  const keys = knowledge.parameters.map((p) => p.key)
  const input = (body ?? {}) as Record<string, unknown>
  const q = (name: string) => (query[name] === undefined || query[name] === null ? undefined : String(query[name]))
  const limit = Number(q('limit') ?? 50)
  const offset = Number(q('offset') ?? 0)
  const segments = path.split('/').filter(Boolean)
  const route = `${method} /${segments.map((s, i) => (i > 0 && /^[0-9a-f-]{36}$/.test(s) ? ':id' : s)).join('/')}`
  const id = segments.find((s) => /^[0-9a-f-]{36}$/.test(s)) ?? ''

  const crops = knowledge.crops
  const findCrop = (slug: string): CropDef | undefined =>
    crops.find((c) => c.slug === slug.trim().toLowerCase().replace(/[\s_-]/g, ''))

  const presentField = (f: StoredField): Field => {
    const readings = db.readings.filter((r) => r.field_id === f.id)
    const latest = readings.reduce<Reading | null>((a, r) => (!a || r.recorded_at > a.recorded_at ? r : a), null)
    const { owner_id: _owner, ...rest } = f
    return {
      ...rest,
      latest_reading: latest,
      active_cycle_count: db.cycles.filter((c) => c.field_id === f.id && c.status === 'active').length,
    }
  }
  const presentCycle = (c: StoredCycle): CropCycle => {
    const crop = findCrop(c.crop)
    return {
      ...c,
      field_name: db.fields.find((f) => f.id === c.field_id)?.name ?? '',
      crop_name: crop?.name ?? c.crop,
      progress: crop && c.status === 'active' ? computeProgress(knowledge, crop, c.planted_on, c.expected_harvest_on, today()) : null,
    }
  }
  const presentRec = (r: StoredRecommendation): Recommendation => {
    const { user_id: _user, ...rest } = r
    return { ...rest, warnings: outOfRangeWarnings(knowledge, r.inputs) }
  }

  /* --- public routes --- */
  if (route === 'POST /auth/register') {
    const email = String(input.email ?? '').trim().toLowerCase()
    const fullName = String(input.full_name ?? '').trim()
    const password = String(input.password ?? '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, 'email: Enter a valid email address')
    if (!fullName) fail(422, 'full_name: Enter your name')
    checkPassword(password)
    if (db.users.some((u) => u.email === email)) fail(409, 'An account with this email already exists')
    const salt = uuid()
    const user: StoredUser = { id: uuid(), email, full_name: fullName, created_at: now(), last_login_at: null, salt, password_hash: await hash(password, salt) }
    db.users.push(user)
    save(db)
    return PUBLIC_USER(user)
  }
  if (route === 'POST /auth/login') {
    const user = db.users.find((u) => u.email === (form?.username ?? '').trim().toLowerCase())
    if (!user || user.password_hash !== (await hash(form?.password ?? '', user.salt)))
      fail(401, 'Incorrect email or password')
    const session = uuid()
    db.sessions[session] = user!.id
    user!.last_login_at = now()
    save(db)
    return { access_token: session, token_type: 'bearer', expires_in: 7 * 86_400 }
  }
  if (route === 'GET /crops') {
    return crops.map((c) => cropRead(c))
  }
  if (route.startsWith('GET /crops/')) {
    const crop = findCrop(segments[1] ?? '')
    return crop ? cropRead(crop) : fail(404, 'Crop not found')
  }
  if (route === 'GET /model') {
    const { trees: _trees, ...info } = model
    return info
  }

  /* --- authenticated routes --- */
  const userId = token ? db.sessions[token] : undefined
  const user = db.users.find((u) => u.id === userId)
  if (!user) return fail(401, 'Could not validate credentials')

  const ownedField = (fieldId: string) => {
    const field = db.fields.find((f) => f.id === fieldId && f.owner_id === user.id)
    return field ?? fail(404, 'Field not found')
  }
  const ownedCycle = (cycleId: string) => {
    const cycle = db.cycles.find((c) => c.id === cycleId)
    if (!cycle || !db.fields.some((f) => f.id === cycle.field_id && f.owner_id === user.id)) fail(404, 'Crop cycle not found')
    return cycle!
  }
  const located = (field: StoredField): [number, number] =>
    field.latitude !== null && field.longitude !== null
      ? [field.latitude, field.longitude]
      : fail(409, 'Add a location to this field to use weather data.')
  const weatherCall = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call()
    } catch (err) {
      return fail(502, err instanceof Error ? err.message : 'The weather service could not be reached.')
    }
  }
  const commit = <T>(value: T): T => {
    save(db)
    return value
  }

  switch (route) {
    case 'GET /users/me':
      return PUBLIC_USER(user)
    case 'PATCH /users/me': {
      const name = String(input.full_name ?? '').trim()
      if (name) user.full_name = name
      return commit(PUBLIC_USER(user))
    }
    case 'POST /users/me/password': {
      if (user.password_hash !== (await hash(String(input.current_password ?? ''), user.salt)))
        fail(400, 'Current password is incorrect')
      checkPassword(String(input.new_password ?? ''))
      user.password_hash = await hash(String(input.new_password), user.salt)
      return commit(undefined)
    }
    case 'DELETE /users/me': {
      const fieldIds = new Set(db.fields.filter((f) => f.owner_id === user.id).map((f) => f.id))
      db.readings = db.readings.filter((r) => !fieldIds.has(r.field_id))
      db.cycles = db.cycles.filter((c) => !fieldIds.has(c.field_id))
      db.fields = db.fields.filter((f) => !fieldIds.has(f.id))
      db.recommendations = db.recommendations.filter((r) => r.user_id !== user.id)
      db.users = db.users.filter((u) => u.id !== user.id)
      for (const [s, uid] of Object.entries(db.sessions)) if (uid === user.id) delete db.sessions[s]
      return commit(undefined)
    }

    case 'GET /dashboard': {
      const fieldIds = new Set(db.fields.filter((f) => f.owner_id === user.id).map((f) => f.id))
      const active = db.cycles
        .filter((c) => fieldIds.has(c.field_id) && c.status === 'active')
        .sort((a, b) => a.expected_harvest_on.localeCompare(b.expected_harvest_on))
      const recs = db.recommendations.filter((r) => r.user_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
      return {
        field_count: fieldIds.size,
        active_cycle_count: active.length,
        recommendation_count: recs.length,
        reading_count: db.readings.filter((r) => fieldIds.has(r.field_id)).length,
        recent_recommendations: recs.slice(0, 5).map(presentRec),
        active_cycles: active.slice(0, 6).map(presentCycle),
      }
    }

    case 'GET /fields': {
      const items = db.fields.filter((f) => f.owner_id === user.id).sort((a, b) => a.name.localeCompare(b.name))
      return page(items.map(presentField), limit, offset)
    }
    case 'POST /fields': {
      const name = String(input.name ?? '').trim()
      if (!name) fail(422, 'name: Give the field a name')
      if (db.fields.some((f) => f.owner_id === user.id && f.name === name)) fail(409, 'You already have a field with this name')
      const field: StoredField = {
        id: uuid(),
        owner_id: user.id,
        name,
        latitude: (input.latitude as number | null) ?? null,
        longitude: (input.longitude as number | null) ?? null,
        area_hectares: (input.area_hectares as number | null) ?? null,
        soil_type: (input.soil_type as string | null) ?? null,
        notes: (input.notes as string | null) ?? null,
        created_at: now(),
        updated_at: now(),
      }
      db.fields.push(field)
      return commit(presentField(field))
    }
    case 'GET /fields/:id':
      return presentField(ownedField(id))
    case 'PATCH /fields/:id': {
      const field = ownedField(id)
      if (typeof input.name === 'string') {
        const name = input.name.trim()
        if (db.fields.some((f) => f.owner_id === user.id && f.name === name && f.id !== field.id)) fail(409, 'You already have a field with this name')
      }
      Object.assign(field, input, { updated_at: now() })
      return commit(presentField(field))
    }
    case 'DELETE /fields/:id': {
      ownedField(id)
      db.fields = db.fields.filter((f) => f.id !== id)
      db.readings = db.readings.filter((r) => r.field_id !== id)
      db.cycles = db.cycles.filter((c) => c.field_id !== id)
      db.weather = (db.weather ?? []).filter((w) => w.field_id !== id)
      for (const r of db.recommendations) if (r.field_id === id) r.field_id = null
      return commit(undefined)
    }

    case 'GET /fields/:id/readings': {
      ownedField(id)
      const since = q('since')
      const until = q('until')
      const items = db.readings
        .filter((r) => r.field_id === id && (!since || r.recorded_at >= new Date(since).toISOString()) && (!until || r.recorded_at <= new Date(until).toISOString()))
        .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      return page(items, Number(q('limit') ?? 500), offset)
    }
    case 'POST /fields/:id/readings': {
      ownedField(id)
      const recordedAt = input.recorded_at ? new Date(String(input.recorded_at)).toISOString() : now()
      if (recordedAt > new Date(Date.now() + 300_000).toISOString()) fail(422, 'recorded_at cannot be in the future')
      const reading: Reading = { id: uuid(), field_id: id, recorded_at: recordedAt, source: 'manual', ...pickConditions(input, keys) }
      db.readings.push(reading)
      return commit(reading)
    }
    case 'POST /fields/:id/readings/simulate': {
      ownedField(id)
      const days = Math.min(Math.max(Number(input.days ?? 30), 1), 365)
      const series = generateSeries(knowledge, { end: Date.now(), count: days, intervalMs: 86_400_000 })
      const created = series.map((p): Reading => ({ id: uuid(), field_id: id, recorded_at: new Date(p.recordedAt).toISOString(), source: 'simulated', ...p.values }))
      db.readings.push(...created)
      return commit(page(created.reverse(), created.length, 0))
    }
    case 'DELETE /fields/:id/readings':
      ownedField(id)
      db.readings = db.readings.filter((r) => r.field_id !== id)
      return commit(undefined)

    case 'POST /fields/:id/cycles': {
      ownedField(id)
      const crop = findCrop(String(input.crop ?? '')) ?? fail(422, `Unknown crop '${String(input.crop)}'`)
      const planted = String(input.planted_on ?? '')
      const expected = (input.expected_harvest_on as string | null) || addDays(planted, crop.days_to_harvest)
      if (planted > today()) fail(422, 'Planting date cannot be in the future')
      if (expected <= planted) fail(422, 'Expected harvest date must be after the planting date')
      const cycle: StoredCycle = {
        id: uuid(),
        field_id: id,
        crop: crop.slug,
        planted_on: planted,
        expected_harvest_on: expected,
        harvested_on: null,
        status: 'active',
        yield_kg: null,
        notes: (input.notes as string | null) ?? null,
        created_at: now(),
      }
      db.cycles.push(cycle)
      return commit(presentCycle(cycle))
    }
    case 'GET /cycles': {
      const fieldIds = new Set(db.fields.filter((f) => f.owner_id === user.id).map((f) => f.id))
      const status = q('status')
      const fieldId = q('field_id')
      const items = db.cycles
        .filter((c) => fieldIds.has(c.field_id) && (!status || c.status === status) && (!fieldId || c.field_id === fieldId))
        .sort((a, b) => b.planted_on.localeCompare(a.planted_on))
      return page(items.map(presentCycle), limit, offset)
    }
    case 'GET /cycles/:id':
      return presentCycle(ownedCycle(id))
    case 'PATCH /cycles/:id': {
      const cycle = ownedCycle(id)
      const changes = { ...input } as Partial<StoredCycle>
      if (changes.status === 'harvested' && !changes.harvested_on) changes.harvested_on = cycle.harvested_on ?? today()
      if (changes.status === 'active') changes.harvested_on = null
      const next = { ...cycle, ...changes }
      if (next.harvested_on && next.harvested_on > today()) fail(422, 'Harvest date cannot be in the future')
      if (next.harvested_on && next.harvested_on < next.planted_on) fail(422, 'Harvest date cannot be before planting')
      Object.assign(cycle, changes)
      return commit(presentCycle(cycle))
    }
    case 'DELETE /cycles/:id':
      ownedCycle(id)
      db.cycles = db.cycles.filter((c) => c.id !== id)
      return commit(undefined)

    case 'POST /recommendations': {
      const fieldId = (input.field_id as string | null) ?? null
      let conditions = input.conditions ? pickConditions(input.conditions as Record<string, unknown>, keys) : null
      if (fieldId) {
        ownedField(fieldId)
        if (!conditions) {
          const latest = db.readings.filter((r) => r.field_id === fieldId).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
          if (!latest) fail(409, 'This field has no readings yet. Add or simulate a reading first.')
          conditions = pickConditions(latest as unknown as Record<string, unknown>, keys)
        }
      }
      if (!conditions) return fail(422, 'Provide conditions, a field_id, or both')
      const ranked = rankCrops(model, conditions).slice(0, Math.min(Math.max(Number(input.top_k ?? 3), 1), 10))
      const rec: StoredRecommendation = {
        id: uuid(),
        user_id: user.id,
        field_id: fieldId,
        created_at: now(),
        inputs: conditions,
        predictions: ranked.map((s) => ({ crop: s.crop, name: cropName(knowledge, s.crop), probability: Math.round(s.probability * 1e4) / 1e4 })),
        recommended_crop: ranked[0]?.crop ?? '',
        model_version: model.version,
        climate_basis: typeof input.climate_basis === 'string' ? input.climate_basis.slice(0, 200) : null,
      }
      db.recommendations.push(rec)
      return commit(presentRec(rec))
    }
    case 'GET /recommendations': {
      const fieldId = q('field_id')
      const items = db.recommendations
        .filter((r) => r.user_id === user.id && (!fieldId || r.field_id === fieldId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      return page(items.map(presentRec), Number(q('limit') ?? 20), offset)
    }
    case 'GET /recommendations/:id': {
      const rec = db.recommendations.find((r) => r.id === id && r.user_id === user.id)
      return rec ? presentRec(rec) : fail(404, 'Recommendation not found')
    }
    case 'DELETE /recommendations/:id': {
      if (!db.recommendations.some((r) => r.id === id && r.user_id === user.id)) fail(404, 'Recommendation not found')
      db.recommendations = db.recommendations.filter((r) => r.id !== id)
      return commit(undefined)
    }

    case 'GET /fields/:id/weather/forecast': {
      const [lat, lon] = located(ownedField(id))
      return weatherCall(() => fetchForecast(lat, lon, Math.min(Math.max(Number(q('days') ?? 7), 1), 16)))
    }
    case 'POST /fields/:id/weather/sync': {
      const field = ownedField(id)
      const [lat, lon] = located(field)
      const years = Math.min(Math.max(Number(input.years ?? 3), 1), 10)
      const end = today()
      const wantedStart = addDays(end, -365 * years)
      const stored = (db.weather ?? []).filter((w) => w.field_id === id).map((w) => w.day).sort()
      const ranges: [string, string][] = []
      if (stored.length === 0) ranges.push([wantedStart, end])
      else {
        if (wantedStart < stored[0]!) ranges.push([wantedStart, addDays(stored[0]!, -1)])
        const refresh = addDays(stored[stored.length - 1]!, -7)
        ranges.push([refresh > stored[0]! ? refresh : stored[0]!, end])
      }
      let fetched = 0
      for (const [start, stop] of ranges) {
        const records = await weatherCall(() => fetchHistory(lat, lon, start, stop, end))
        if (records.length === 0) continue
        const first = records[0]!.day
        const last = records[records.length - 1]!.day
        db.weather = (db.weather ?? []).filter((w) => w.field_id !== id || w.day < first || w.day > last)
        db.weather.push(...records.map((r) => ({ ...r, field_id: id })))
        fetched += records.length
      }
      const days = (db.weather ?? []).filter((w) => w.field_id === id).map((w) => w.day).sort()
      return commit({ fetched, total_days: days.length, start: days[0] ?? null, end: days[days.length - 1] ?? null })
    }
    case 'GET /fields/:id/weather': {
      ownedField(id)
      const since = q('since')
      const until = q('until')
      return (db.weather ?? [])
        .filter((w) => w.field_id === id && (!since || w.day >= since) && (!until || w.day <= until))
        .sort((a, b) => a.day.localeCompare(b.day))
        .map(({ field_id: _f, ...day }) => day)
    }
    case 'GET /fields/:id/weather/climate': {
      ownedField(id)
      const days = (db.weather ?? []).filter((w) => w.field_id === id)
      const normals = monthlyNormals(days)
      const start = q('season_start')
      const sorted = days.map((d) => d.day).sort()
      return {
        coverage: { start: sorted[0] ?? null, end: sorted[sorted.length - 1] ?? null, days: days.length },
        recent: recentSummaries(days),
        normals,
        season: start ? seasonClimate(normals, Number(start), Number(q('season_months') ?? 4)) : null,
        attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
      }
    }

    case 'GET /fields/:id/devices':
    case 'GET /fields/:id/telemetry':
      ownedField(id)
      return []
    case 'GET /fields/:id/telemetry/summary':
      ownedField(id)
      return { days: 7, readings: 0, start: null, end: null, air_temperature: null, air_humidity: null, soil_moisture: null, soil_temperature: null }
    case 'POST /fields/:id/devices':
      return fail(501, 'Sensor stations need the full AgroAI server and are not available in the browser demo.')

    case 'POST /advisory': {
      const crop = findCrop(String(input.crop ?? '')) ?? fail(404, `Unknown crop '${String(input.crop)}'`)
      const conditions = pickConditions(input.conditions as Record<string, unknown>, keys)
      const probability = rankCrops(model, conditions).find((s) => s.crop === crop.slug)?.probability ?? null
      return assess(knowledge, crop, conditions, probability)
    }
  }
  return fail(404, 'Not found')
}

function cropRead(c: CropDef) {
  return {
    slug: c.slug,
    name: c.name,
    category: c.category,
    lifecycle: c.lifecycle,
    days_to_harvest: c.days_to_harvest,
    description: c.description,
    requirements: Object.fromEntries(
      Object.entries(c.profile).map(([key, s]) => [
        key,
        { min: s.min, max: s.max, optimal_min: s.p10, optimal_max: s.p90, typical: s.median },
      ]),
    ),
  }
}
