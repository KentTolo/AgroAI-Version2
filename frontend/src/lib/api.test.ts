import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, setUnauthorizedHandler, tokenStore } from './api'

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
  setUnauthorizedHandler(null)
})

describe('api client', () => {
  it('sends the bearer token and JSON body', async () => {
    tokenStore.set('abc')
    const fetch = mockFetch(201, { id: '1' })
    await api.createField({ name: 'North' })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/fields')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
    expect(init.body).toBe(JSON.stringify({ name: 'North' }))
  })

  it('posts login as a form, as OAuth2 requires', async () => {
    const fetch = mockFetch(200, { access_token: 't', token_type: 'bearer', expires_in: 60 })
    await api.login('a@b.co', 'pw')
    const [, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(String(init.body)).toBe('username=a%40b.co&password=pw')
  })

  it('turns validation errors into readable messages', async () => {
    mockFetch(422, { detail: [{ loc: ['body', 'conditions', 'ph'], msg: 'Input should be less than or equal to 14' }] })
    await expect(api.advise({ crop: 'maize', conditions: {} as never })).rejects.toThrow(
      'conditions.ph: Input should be less than or equal to 14',
    )
  })

  it('signs out when a stored token is rejected', async () => {
    tokenStore.set('expired')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mockFetch(401, { detail: 'Could not validate credentials' })
    await expect(api.me()).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.crops()).rejects.toMatchObject({ status: 0 })
  })

  it('omits empty query parameters', async () => {
    const fetch = mockFetch(200, { items: [], total: 0, limit: 20, offset: 0 })
    await api.recommendations({ field_id: undefined, limit: 20 })
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/recommendations?limit=20')
  })
})
