import { randomUUID } from 'node:crypto'
import { Client as MinioSdkClient } from 'minio'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MinioStorageClient } from '../src/lib/storage/minio-storage-client'

/**
 * Smoke-тест на настоящем MinIO через Testcontainers. Цель — убедиться что
 * MinioStorageClient правильно говорит с S3-совместимым backend'ом:
 *  - подписанные URL реально работают (PUT/GET/PART)
 *  - multipart lifecycle: init → part URLs → upload → complete → head
 *  - ensureBucket создаёт бакет, headObject возвращает корректный metadata
 *  - deleteObject + abortMultipartUpload идемпотентны
 *
 * Остальные тесты (B2b/B2c) используют InMemoryStorageClient через app.storage.
 * Этот smoke-тест — единственное место, где сеть с MinIO поднимается.
 */

const ACCESS_KEY = 'minio-smoke'
const SECRET_KEY = 'minio-smoke-password'
const BUCKET = `jumix-smoke-${randomUUID()}`

describe('MinioStorageClient (Testcontainers MinIO)', () => {
  let container: StartedTestContainer
  let client: MinioStorageClient

  beforeAll(async () => {
    container = await new GenericContainer('minio/minio:latest')
      .withEnvironment({
        MINIO_ROOT_USER: ACCESS_KEY,
        MINIO_ROOT_PASSWORD: SECRET_KEY,
      })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000).withStartupTimeout(30_000))
      .start()

    const host = container.getHost()
    const port = container.getMappedPort(9000)
    const sdk = new MinioSdkClient({
      endPoint: host,
      port,
      useSSL: false,
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: 'us-east-1',
      pathStyle: true,
    })

    client = new MinioStorageClient({
      client: sdk,
      bucket: BUCKET,
      region: 'us-east-1',
      presign: {
        getTtlSeconds: 900,
        putTtlSeconds: 300,
        partTtlSeconds: 900,
      },
    })

    await client.ensureBucket()
  }, 120_000)

  afterAll(async () => {
    if (container) await container.stop()
  })

  it('simple presigned PUT flow: sign → upload via fetch → head → GET → delete', async () => {
    const key = `orgs/${randomUUID()}/operators/${randomUUID()}/avatar/me.jpg`
    const body = Buffer.from('small-avatar-bytes')

    const put = await client.createPresignedPutUrl(key, { contentType: 'image/jpeg' })
    expect(put.url).toMatch(/^http:\/\//)
    expect(put.headers['Content-Type']).toBe('image/jpeg')

    const uploadRes = await fetch(put.url, {
      method: 'PUT',
      headers: put.headers,
      body,
    })
    expect(uploadRes.ok).toBe(true)

    const head = await client.headObject(key)
    expect(head).not.toBeNull()
    expect(head?.size).toBe(body.length)
    expect(head?.contentType).toBe('image/jpeg')

    const get = await client.createPresignedGetUrl(key, {
      responseContentDisposition: 'attachment; filename="me.jpg"',
    })
    const dlRes = await fetch(get.url)
    expect(dlRes.ok).toBe(true)
    expect(dlRes.headers.get('content-disposition')).toContain('me.jpg')
    const dlBody = Buffer.from(await dlRes.arrayBuffer())
    expect(dlBody.equals(body)).toBe(true)

    await client.deleteObject(key)
    expect(await client.headObject(key)).toBeNull()
    // idempotent
    await expect(client.deleteObject(key)).resolves.toBeUndefined()
  })

  it('headObject returns null for non-existent key', async () => {
    const key = `orgs/${randomUUID()}/operators/${randomUUID()}/avatar/ghost.jpg`
    expect(await client.headObject(key)).toBeNull()
  })

  it('multipart flow: init → two parts (min 5MB) → complete → head → download → delete', async () => {
    // S3 требует минимум 5 MiB на part (кроме last). Два парта: 5 MiB + маленький хвост.
    // Testcontainers MinIO тот же лимит соблюдает — если взять <5 MB, complete упадёт с EntityTooSmall.
    const key = `orgs/${randomUUID()}/operators/${randomUUID()}/documents/${randomUUID()}/v1/passport.pdf`
    const part1 = Buffer.alloc(5 * 1024 * 1024, 0xab) // 5 MiB of 0xab
    const part2 = Buffer.from('trailing-tail')

    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    expect(uploadId).toBeTruthy()

    const url1 = (await client.createPresignedUploadPartUrl(key, uploadId, 1)).url
    const url2 = (await client.createPresignedUploadPartUrl(key, uploadId, 2)).url

    const res1 = await fetch(url1, { method: 'PUT', body: part1 })
    expect(res1.ok).toBe(true)
    const etag1 = stripEtag(res1.headers.get('etag'))

    const res2 = await fetch(url2, { method: 'PUT', body: part2 })
    expect(res2.ok).toBe(true)
    const etag2 = stripEtag(res2.headers.get('etag'))

    expect(etag1).toBeTruthy()
    expect(etag2).toBeTruthy()

    const { etag } = await client.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag: etag1 },
      { partNumber: 2, etag: etag2 },
    ])
    expect(etag).toBeTruthy()

    const head = await client.headObject(key)
    expect(head?.size).toBe(part1.length + part2.length)
    expect(head?.contentType).toBe('application/pdf')

    const get = await client.createPresignedGetUrl(key)
    const dlRes = await fetch(get.url)
    expect(dlRes.ok).toBe(true)
    const dlBody = Buffer.from(await dlRes.arrayBuffer())
    expect(dlBody.length).toBe(part1.length + part2.length)
    expect(dlBody.subarray(-part2.length).equals(part2)).toBe(true)

    await client.deleteObject(key)
    expect(await client.headObject(key)).toBeNull()
  }, 60_000)

  it('abortMultipartUpload cancels pending upload and is idempotent', async () => {
    const key = `orgs/${randomUUID()}/operators/${randomUUID()}/documents/${randomUUID()}/v1/draft.pdf`
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })

    await expect(client.abortMultipartUpload(key, uploadId)).resolves.toBeUndefined()
    // повторный abort не падает — NoSuchUpload проглатывается
    await expect(client.abortMultipartUpload(key, uploadId)).resolves.toBeUndefined()
  })

  it('ensureBucket is idempotent', async () => {
    await expect(client.ensureBucket()).resolves.toBeUndefined()
    await expect(client.ensureBucket()).resolves.toBeUndefined()
  })
})

function stripEtag(raw: string | null): string {
  if (!raw) return ''
  // S3/MinIO оборачивают etag в двойные кавычки: "deadbeef..."
  return raw.replace(/^"|"$/g, '')
}
