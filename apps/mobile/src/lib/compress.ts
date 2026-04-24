import * as LegacyFS from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.8
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB — матчит backend invariant

export class FileTooLargeError extends Error {
  constructor(public bytes: number) {
    super('FILE_TOO_LARGE')
    this.name = 'FileTooLargeError'
  }
}

export class FileNotFoundError extends Error {
  constructor() {
    super('FILE_NOT_FOUND')
    this.name = 'FileNotFoundError'
  }
}

export interface CompressedImage {
  uri: string
  size: number
  mimeType: 'image/jpeg'
  fileName: string
}

/**
 * Compress image перед upload. Resize к MAX_WIDTH + JPEG quality 0.8 →
 * typical output 500KB-2MB (против 4-12MB original из phone camera).
 *
 * После compression проверяем size vs MAX_FILE_BYTES — backend limit.
 * Throw'им `FileTooLargeError` — UI показывает actionable message.
 */
export async function compressImage(
  uri: string,
  originalFileName: string,
): Promise<CompressedImage> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: MAX_WIDTH } }], {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  })

  const info = await LegacyFS.getInfoAsync(result.uri)
  if (!info.exists) {
    throw new FileNotFoundError()
  }

  const size = 'size' in info && typeof info.size === 'number' ? info.size : 0

  if (size > MAX_FILE_BYTES) {
    throw new FileTooLargeError(size)
  }

  // Replace extension на .jpg (manipulator converts to JPEG)
  const fileName = originalFileName.replace(/\.[^.]+$/, '.jpg') || 'license.jpg'

  return {
    uri: result.uri,
    size,
    mimeType: 'image/jpeg',
    fileName,
  }
}

/**
 * PDF не компрессится (нет Expo-нативного PDF-optimizer'а) — только size check.
 * User responsibility уменьшить PDF before picker.
 */
export async function validatePdfSize(uri: string): Promise<number> {
  const info = await LegacyFS.getInfoAsync(uri)
  if (!info.exists) {
    throw new FileNotFoundError()
  }
  const size = typeof info.size === 'number' ? info.size : 0
  if (size > MAX_FILE_BYTES) {
    throw new FileTooLargeError(size)
  }
  return size
}
