// Legacy namespace — modern expo-file-system API (SDK 54+ File class) не
// предоставляет upload с progress. `createUploadTask` переезжает редко —
// legacy эндпоинт надёжен до SDK 55+.
import * as LegacyFS from 'expo-file-system/legacy'

export interface UploadParams {
  uri: string
  uploadUrl: string
  contentType: string
  headers: Record<string, string>
  /** Progress callback: fraction 0..1 от общего размера. */
  onProgress?: (fraction: number) => void
}

export interface UploadResult {
  status: number
  body: string
}

/**
 * PUT файла по presigned URL с progress callback.
 *
 * React Native `fetch` не поддерживает upload progress (только download),
 * поэтому используем `FileSystem.createUploadTask` — единственный
 * официальный путь в Expo. Под капотом NSURLSessionUploadTask (iOS) /
 * OkHttp ProgressRequestBody (Android).
 *
 * Headers MUST forward exactly — MinIO presigned URL requires Content-Type
 * + x-amz-* headers. Mismatch → 403 SignatureDoesNotMatch.
 */
export async function uploadFileWithProgress(params: UploadParams): Promise<UploadResult> {
  const { uri, uploadUrl, contentType, headers, onProgress } = params

  const task = LegacyFS.createUploadTask(
    uploadUrl,
    uri,
    {
      httpMethod: 'PUT',
      headers: {
        ...headers,
        'Content-Type': contentType,
      },
      uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
    },
    (event) => {
      if (event.totalBytesExpectedToSend > 0 && onProgress) {
        const fraction = event.totalBytesSent / event.totalBytesExpectedToSend
        onProgress(Math.min(Math.max(fraction, 0), 1))
      }
    },
  )

  const result = await task.uploadAsync()
  if (!result) {
    throw new Error('UPLOAD_TASK_RETURNED_NULL')
  }
  return { status: result.status, body: result.body }
}
