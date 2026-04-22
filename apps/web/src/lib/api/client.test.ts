import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, registerApiHooks } from './client'
import { NetworkError } from './errors'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  registerApiHooks({
    getAccessToken: () => 'access-1',
    refresh: async () => true,
    onUnauthorized: () => {},
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown) {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('apiFetch', () => {
  it('attaches Authorization header by default', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    await apiFetch('/foo')
    const [, init] = fetchMock.mock.calls[0]!
    const headers = init.headers as Headers
    expect(headers.get('authorization')).toBe('Bearer access-1')
  })

  it('skips auth when skipAuth=true', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    await apiFetch('/auth/sms/request', {
      skipAuth: true,
      method: 'POST',
      body: { phone: '+77010001122' },
    })
    const [, init] = fetchMock.mock.calls[0]!
    const headers = init.headers as Headers
    expect(headers.has('authorization')).toBe(false)
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('serializes body as JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))
    await apiFetch('/foo', { method: 'POST', body: { x: 1 } })
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toBe('{"x":1}')
  })

  it('parses error envelope into AppError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'PHONE_TAKEN', message: 'Phone already used' } }),
    )
    await expect(apiFetch('/foo')).rejects.toMatchObject({
      name: 'AppError',
      code: 'PHONE_TAKEN',
      statusCode: 409,
    })
  })

  it('throws NetworkError when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'))
    await expect(apiFetch('/foo')).rejects.toBeInstanceOf(NetworkError)
  })

  it('on 401 triggers refresh and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))

    const refresh = vi.fn().mockResolvedValue(true)
    registerApiHooks({
      getAccessToken: () => 'access-1',
      refresh,
      onUnauthorized: () => {},
    })

    const result = await apiFetch<{ ok: boolean }>('/foo')
    expect(result).toEqual({ ok: true })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('on 401 with failed refresh — calls onUnauthorized + rethrows AppError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }),
    )
    const onUnauthorized = vi.fn()
    registerApiHooks({
      getAccessToken: () => 'access-1',
      refresh: async () => false,
      onUnauthorized,
    })

    await expect(apiFetch('/foo')).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 401,
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('handles 204 No Content gracefully', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await apiFetch('/foo')
    expect(result).toBeUndefined()
  })

  it('attaches X-Organization-Id when organizationId provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))
    await apiFetch('/foo', { organizationId: 'org-123' })
    const [, init] = fetchMock.mock.calls[0]!
    const headers = init.headers as Headers
    expect(headers.get('x-organization-id')).toBe('org-123')
  })
})
