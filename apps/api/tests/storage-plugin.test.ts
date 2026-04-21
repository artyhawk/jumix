import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { InMemoryStorageClient } from '../src/lib/storage/memory-storage-client'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'

/**
 * Plugin-integration тест: проверяет, что buildApp без STORAGE_ENDPOINT
 * поднимает InMemoryStorageClient и декорирует app.storage. Реальный MinIO
 * flow проверяется в storage.smoke.test.ts на Testcontainer'е.
 */

describe('storage plugin (InMemory driver via buildApp)', () => {
  let handle: TestAppHandle

  beforeAll(async () => {
    handle = await buildTestApp()
  })

  afterAll(async () => {
    await handle.close()
  })

  it('decorates app.storage with InMemoryStorageClient in test env', () => {
    expect(handle.app.storage).toBeInstanceOf(InMemoryStorageClient)
  })

  it('InMemory client is functional through app.storage', async () => {
    const key =
      'orgs/11111111-2222-3333-4444-555555555555/operators/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/avatar/me.jpg'
    const put = await handle.app.storage.createPresignedPutUrl(key, {
      contentType: 'image/jpeg',
    })
    expect(put.url).toMatch(/^memory:\/\/put\//)
    expect(put.headers['Content-Type']).toBe('image/jpeg')

    // Head возвращает null до upload'а
    expect(await handle.app.storage.headObject(key)).toBeNull()
  })
})
