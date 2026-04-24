import * as LegacyFS from 'expo-file-system/legacy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadFileWithProgress } from './upload'

describe('uploadFileWithProgress', () => {
  beforeEach(() => {
    vi.mocked(LegacyFS.createUploadTask).mockReset()
  })

  it('возвращает status + body при успехе', async () => {
    const fakeTask = {
      uploadAsync: vi.fn(async () => ({ status: 200, body: 'OK', headers: {} })),
    }
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue(fakeTask as never)

    const result = await uploadFileWithProgress({
      uri: 'file:///tmp/a.jpg',
      uploadUrl: 'https://minio.example.com/put',
      contentType: 'image/jpeg',
      headers: { 'x-amz-signature': 'abc' },
    })

    expect(result).toEqual({ status: 200, body: 'OK' })
    expect(LegacyFS.createUploadTask).toHaveBeenCalledWith(
      'https://minio.example.com/put',
      'file:///tmp/a.jpg',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: expect.objectContaining({
          'x-amz-signature': 'abc',
          'Content-Type': 'image/jpeg',
        }),
      }),
      expect.any(Function),
    )
  })

  it('onProgress callback фаерится с fraction 0..1', async () => {
    let progressCallback:
      | ((e: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void)
      | undefined
    const fakeTask = {
      uploadAsync: vi.fn(async () => {
        // Симулируем progress events
        if (progressCallback) {
          progressCallback({ totalBytesSent: 500, totalBytesExpectedToSend: 1000 })
          progressCallback({ totalBytesSent: 1000, totalBytesExpectedToSend: 1000 })
        }
        return { status: 200, body: 'OK', headers: {} }
      }),
    }
    vi.mocked(LegacyFS.createUploadTask).mockImplementation((_url, _uri, _opts, cb) => {
      progressCallback = cb as typeof progressCallback
      return fakeTask as never
    })

    const onProgress = vi.fn()
    await uploadFileWithProgress({
      uri: 'file:///tmp/a.jpg',
      uploadUrl: 'https://x',
      contentType: 'image/jpeg',
      headers: {},
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledWith(0.5)
    expect(onProgress).toHaveBeenCalledWith(1)
  })

  it('throws если task.uploadAsync вернёт null', async () => {
    const fakeTask = { uploadAsync: vi.fn(async () => null) }
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue(fakeTask as never)

    await expect(
      uploadFileWithProgress({
        uri: 'file:///tmp/a.jpg',
        uploadUrl: 'https://x',
        contentType: 'image/jpeg',
        headers: {},
      }),
    ).rejects.toThrow('UPLOAD_TASK_RETURNED_NULL')
  })
})
