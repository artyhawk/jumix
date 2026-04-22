import { describe, expect, it } from 'vitest'
import { InMemoryStorageClient } from '../src/lib/storage/memory-storage-client'
import {
  buildAvatarKey,
  buildCraneProfileLicenseKey,
  buildDocumentKey,
  extractOrgIdFromKey,
  sanitizeFilename,
} from '../src/lib/storage/object-key'

const ORG_A = '11111111-2222-3333-4444-555555555555'
const ORG_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const OP_1 = '66666666-7777-8888-9999-000000000001'
const DOC_1 = '66666666-7777-8888-9999-000000000002'

describe('sanitizeFilename', () => {
  it('keeps safe ASCII filenames as-is', () => {
    expect(sanitizeFilename('passport.pdf')).toBe('passport.pdf')
    expect(sanitizeFilename('scan-2026_04_22.jpg')).toBe('scan-2026_04_22.jpg')
  })

  it('replaces unsafe characters and collapses/trims separators (scrub path)', () => {
    // кириллица → scrubbed → collapsed → trimmed (каждая cyrillic → _, потом
    // collapse _+ в один, потом strip leading/trailing .-_)
    expect(sanitizeFilename('паспорт.pdf')).toBe('pdf')
    expect(sanitizeFilename('scan with spaces.jpg')).toBe('scan_with_spaces.jpg')
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc_passwd')
    expect(sanitizeFilename('foo   bar')).toBe('foo_bar')
  })

  it('passes safe inputs through unchanged (no aggressive stripping)', () => {
    // ^^^  [._-] допустимы сами по себе в FILENAME_SAFE_RE — leading dot
    // в safe-имени не стрипается (это valid unix filename).
    expect(sanitizeFilename('.hidden')).toBe('.hidden')
    expect(sanitizeFilename('___leading')).toBe('___leading')
  })

  it('caps length at 120 chars', () => {
    const long = `${'a'.repeat(200)}.pdf`
    const result = sanitizeFilename(long)
    expect(result.length).toBeLessThanOrEqual(120)
  })

  it('returns fallback for empty/all-stripped input', () => {
    expect(sanitizeFilename('')).toBe('file')
    expect(sanitizeFilename('   ')).toBe('file')
    expect(sanitizeFilename('☃☃☃')).toBe('file')
  })
})

describe('buildAvatarKey / buildDocumentKey', () => {
  it('avatar key follows orgs/{org}/operators/{op}/avatar/{file}', () => {
    const key = buildAvatarKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      filename: 'me.jpg',
    })
    expect(key).toBe(`orgs/${ORG_A}/operators/${OP_1}/avatar/me.jpg`)
  })

  it('document key follows orgs/{org}/operators/{op}/documents/{doc}/v{N}/{file}', () => {
    const key = buildDocumentKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      documentId: DOC_1,
      version: 2,
      filename: 'passport.pdf',
    })
    expect(key).toBe(`orgs/${ORG_A}/operators/${OP_1}/documents/${DOC_1}/v2/passport.pdf`)
  })

  it('rejects non-UUID ids', () => {
    expect(() =>
      buildAvatarKey({ organizationId: 'not-uuid', operatorId: OP_1, filename: 'x.jpg' }),
    ).toThrow(/organizationId/)
    expect(() =>
      buildDocumentKey({
        organizationId: ORG_A,
        operatorId: OP_1,
        documentId: 'bad',
        version: 1,
        filename: 'x.pdf',
      }),
    ).toThrow(/documentId/)
  })

  it('rejects non-positive version', () => {
    expect(() =>
      buildDocumentKey({
        organizationId: ORG_A,
        operatorId: OP_1,
        documentId: DOC_1,
        version: 0,
        filename: 'x.pdf',
      }),
    ).toThrow(/version/)
    expect(() =>
      buildDocumentKey({
        organizationId: ORG_A,
        operatorId: OP_1,
        documentId: DOC_1,
        version: 1.5,
        filename: 'x.pdf',
      }),
    ).toThrow(/version/)
  })

  it('sanitizes filename inside key', () => {
    const key = buildDocumentKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      documentId: DOC_1,
      version: 1,
      filename: '../etc/passwd',
    })
    expect(key).toContain('/v1/etc_passwd')
    expect(key).not.toContain('..')
  })

  it('extractOrgIdFromKey recovers orgId from canonical keys', () => {
    const key = buildAvatarKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      filename: 'x.jpg',
    })
    expect(extractOrgIdFromKey(key)).toBe(ORG_A)
  })

  it('extractOrgIdFromKey returns null for foreign formats', () => {
    expect(extractOrgIdFromKey('random/key')).toBeNull()
    expect(extractOrgIdFromKey('orgs//leaks')).toBeNull()
  })

  it('extractOrgIdFromKey distinguishes different tenant prefixes', () => {
    const keyA = buildAvatarKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      filename: 'x.jpg',
    })
    const keyB = buildAvatarKey({
      organizationId: ORG_B,
      operatorId: OP_1,
      filename: 'x.jpg',
    })
    expect(extractOrgIdFromKey(keyA)).toBe(ORG_A)
    expect(extractOrgIdFromKey(keyB)).toBe(ORG_B)
    expect(extractOrgIdFromKey(keyA)).not.toBe(extractOrgIdFromKey(keyB))
  })
})

describe('buildCraneProfileLicenseKey (ADR 0005)', () => {
  const CP = '77777777-8888-9999-aaaa-bbbbbbbbbbbb'

  it('builds crane-profiles/{id}/license/v{N}/{file}', () => {
    expect(
      buildCraneProfileLicenseKey({ craneProfileId: CP, version: 1, filename: 'driver.pdf' }),
    ).toBe(`crane-profiles/${CP}/license/v1/driver.pdf`)
  })

  it('rejects non-UUID craneProfileId', () => {
    expect(() =>
      buildCraneProfileLicenseKey({ craneProfileId: 'bad', version: 1, filename: 'x.pdf' }),
    ).toThrow(/craneProfileId/)
  })

  it('rejects version 0 / negative / fractional', () => {
    expect(() =>
      buildCraneProfileLicenseKey({ craneProfileId: CP, version: 0, filename: 'x.pdf' }),
    ).toThrow(/version/)
    expect(() =>
      buildCraneProfileLicenseKey({ craneProfileId: CP, version: -1, filename: 'x.pdf' }),
    ).toThrow(/version/)
    expect(() =>
      buildCraneProfileLicenseKey({ craneProfileId: CP, version: 1.5, filename: 'x.pdf' }),
    ).toThrow(/version/)
  })

  it('sanitizes unsafe filename inside key', () => {
    const key = buildCraneProfileLicenseKey({
      craneProfileId: CP,
      version: 2,
      filename: '../../../etc/passwd',
    })
    expect(key).toContain('/v2/etc_passwd')
    expect(key).not.toContain('..')
  })

  it('versioning puts different v{N} under same profile prefix', () => {
    const v1 = buildCraneProfileLicenseKey({ craneProfileId: CP, version: 1, filename: 'a.pdf' })
    const v2 = buildCraneProfileLicenseKey({ craneProfileId: CP, version: 2, filename: 'a.pdf' })
    expect(v1).not.toBe(v2)
    expect(v1.startsWith(`crane-profiles/${CP}/license/v1/`)).toBe(true)
    expect(v2.startsWith(`crane-profiles/${CP}/license/v2/`)).toBe(true)
  })
})

describe('InMemoryStorageClient — simple PUT/GET/DELETE', () => {
  const makeClient = () => new InMemoryStorageClient(() => new Date('2026-04-22T10:00:00Z'))

  it('createPresignedPutUrl returns fake memory:// URL + required headers', async () => {
    const client = makeClient()
    const key = buildAvatarKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      filename: 'me.jpg',
    })
    const put = await client.createPresignedPutUrl(key, { contentType: 'image/jpeg' })
    expect(put.url).toMatch(/^memory:\/\/put\//)
    expect(put.headers['Content-Type']).toBe('image/jpeg')
    expect(put.expiresAt.getTime()).toBe(new Date('2026-04-22T10:05:00Z').getTime())
  })

  it('putObjectRaw + headObject + deleteObject full cycle', async () => {
    const client = makeClient()
    const key = buildAvatarKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      filename: 'me.jpg',
    })
    const body = Buffer.from('hello world')
    client.putObjectRaw(key, body, 'image/jpeg')

    const head = await client.headObject(key)
    expect(head).not.toBeNull()
    expect(head?.size).toBe(body.length)
    expect(head?.contentType).toBe('image/jpeg')
    expect(head?.etag).toMatch(/^[0-9a-f]{32}$/)

    await client.deleteObject(key)
    expect(await client.headObject(key)).toBeNull()
  })

  it('headObject returns null for non-existent key (no throw)', async () => {
    const client = makeClient()
    expect(
      await client.headObject(
        buildAvatarKey({
          organizationId: ORG_A,
          operatorId: OP_1,
          filename: 'ghost.jpg',
        }),
      ),
    ).toBeNull()
  })

  it('deleteObject is idempotent (no throw on missing)', async () => {
    const client = makeClient()
    await expect(
      client.deleteObject(
        buildAvatarKey({
          organizationId: ORG_A,
          operatorId: OP_1,
          filename: 'ghost.jpg',
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects path-traversal in keys', async () => {
    const client = makeClient()
    await expect(client.headObject('../etc/passwd')).rejects.toThrow(/illegal path/)
    await expect(client.headObject('/absolute')).rejects.toThrow(/illegal path/)
    await expect(client.headObject('')).rejects.toThrow(/non-empty/)
  })

  it('createPresignedGetUrl returns url + expiresAt', async () => {
    const client = makeClient()
    const key = buildAvatarKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      filename: 'me.jpg',
    })
    const get = await client.createPresignedGetUrl(key, {
      responseContentDisposition: 'attachment; filename="me.jpg"',
    })
    expect(get.url).toMatch(/^memory:\/\/get\//)
    expect(get.expiresAt.getTime()).toBe(new Date('2026-04-22T10:15:00Z').getTime())
  })
})

describe('InMemoryStorageClient — multipart upload', () => {
  const orgKey = () =>
    buildDocumentKey({
      organizationId: ORG_A,
      operatorId: OP_1,
      documentId: DOC_1,
      version: 1,
      filename: 'passport.pdf',
    })

  it('full flow: init → upload parts → complete → head reports combined size', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()

    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    expect(uploadId).toMatch(/^[0-9a-f-]{36}$/)
    expect(client.hasPendingUpload(uploadId)).toBe(true)

    const part1 = await client.createPresignedUploadPartUrl(key, uploadId, 1)
    const part2 = await client.createPresignedUploadPartUrl(key, uploadId, 2)
    expect(part1.url).toMatch(/^memory:\/\/part\//)
    expect(part2.url).toContain('partNumber=2')

    const p1body = Buffer.from('first-chunk-')
    const p2body = Buffer.from('second-chunk')
    const { etag: etag1 } = client.uploadPartRaw(uploadId, 1, p1body)
    const { etag: etag2 } = client.uploadPartRaw(uploadId, 2, p2body)

    const result = await client.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag: etag1 },
      { partNumber: 2, etag: etag2 },
    ])
    expect(result.etag).toMatch(/^[0-9a-f]{32}$/)
    expect(client.hasPendingUpload(uploadId)).toBe(false)

    const head = await client.headObject(key)
    expect(head?.size).toBe(p1body.length + p2body.length)
    expect(head?.contentType).toBe('application/pdf')

    const stored = client.getObjectRaw(key)
    expect(stored?.body.toString()).toBe('first-chunk-second-chunk')
  })

  it('complete reassembles parts in partNumber order regardless of array order', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })

    const { etag: e1 } = client.uploadPartRaw(uploadId, 1, Buffer.from('AAA'))
    const { etag: e2 } = client.uploadPartRaw(uploadId, 2, Buffer.from('BBB'))
    const { etag: e3 } = client.uploadPartRaw(uploadId, 3, Buffer.from('CCC'))

    await client.completeMultipartUpload(key, uploadId, [
      { partNumber: 3, etag: e3 },
      { partNumber: 1, etag: e1 },
      { partNumber: 2, etag: e2 },
    ])

    expect(client.getObjectRaw(key)?.body.toString()).toBe('AAABBBCCC')
  })

  it('createPresignedUploadPartUrl throws on unknown uploadId', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    await expect(client.createPresignedUploadPartUrl(key, 'nonexistent', 1)).rejects.toMatchObject({
      code: 'STORAGE_UPLOAD_NOT_FOUND',
    })
  })

  it('createPresignedUploadPartUrl rejects invalid part numbers', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    await expect(client.createPresignedUploadPartUrl(key, uploadId, 0)).rejects.toMatchObject({
      code: 'STORAGE_INVALID_PART_NUMBER',
    })
    await expect(client.createPresignedUploadPartUrl(key, uploadId, 10_001)).rejects.toMatchObject({
      code: 'STORAGE_INVALID_PART_NUMBER',
    })
  })

  it('complete fails if a part was never uploaded', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    const { etag } = client.uploadPartRaw(uploadId, 1, Buffer.from('AAA'))

    await expect(
      client.completeMultipartUpload(key, uploadId, [
        { partNumber: 1, etag },
        { partNumber: 2, etag: 'fake' },
      ]),
    ).rejects.toMatchObject({ code: 'STORAGE_PART_MISSING' })
  })

  it('complete fails on etag mismatch (tamper detection)', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    client.uploadPartRaw(uploadId, 1, Buffer.from('AAA'))

    await expect(
      client.completeMultipartUpload(key, uploadId, [{ partNumber: 1, etag: 'deadbeef' }]),
    ).rejects.toMatchObject({ code: 'STORAGE_PART_ETAG_MISMATCH' })
  })

  it('complete fails on empty parts array', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    await expect(client.completeMultipartUpload(key, uploadId, [])).rejects.toMatchObject({
      code: 'STORAGE_NO_PARTS',
    })
  })

  it('abort removes pending upload; idempotent on unknown id', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    await client.abortMultipartUpload(key, uploadId)
    expect(client.hasPendingUpload(uploadId)).toBe(false)
    // повторный abort — без ошибок
    await expect(client.abortMultipartUpload(key, uploadId)).resolves.toBeUndefined()
  })

  it('completed parts are not visible to headObject before complete is called', async () => {
    const client = new InMemoryStorageClient()
    const key = orgKey()
    const { uploadId } = await client.createMultipartUpload(key, {
      contentType: 'application/pdf',
    })
    client.uploadPartRaw(uploadId, 1, Buffer.from('AAA'))
    expect(await client.headObject(key)).toBeNull()
  })
})
