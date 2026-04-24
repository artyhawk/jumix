import * as LegacyFS from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileNotFoundError, FileTooLargeError, compressImage, validatePdfSize } from './compress'

describe('compressImage', () => {
  beforeEach(() => {
    vi.mocked(ImageManipulator.manipulateAsync).mockReset()
    vi.mocked(LegacyFS.getInfoAsync).mockReset()
  })

  it('successful compress → returns uri + size + mime + filename', async () => {
    vi.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({
      uri: 'file:///tmp/compressed.jpg',
      width: 1600,
      height: 1200,
    } as never)
    vi.mocked(LegacyFS.getInfoAsync).mockResolvedValue({ exists: true, size: 500_000 } as never)

    const result = await compressImage('file:///tmp/orig.heic', 'license.heic')

    expect(result.uri).toBe('file:///tmp/compressed.jpg')
    expect(result.size).toBe(500_000)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.fileName).toBe('license.jpg')
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///tmp/orig.heic',
      [{ resize: { width: 1600 } }],
      expect.objectContaining({ compress: 0.8 }),
    )
  })

  it('throws FileTooLargeError когда результат > 10MB', async () => {
    vi.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({
      uri: 'file:///tmp/huge.jpg',
      width: 4000,
      height: 3000,
    } as never)
    vi.mocked(LegacyFS.getInfoAsync).mockResolvedValue({
      exists: true,
      size: 11 * 1024 * 1024,
    } as never)

    await expect(compressImage('file:///tmp/orig.jpg', 'big.jpg')).rejects.toBeInstanceOf(
      FileTooLargeError,
    )
  })

  it('throws FileNotFoundError когда compressed file исчез', async () => {
    vi.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({
      uri: 'file:///tmp/gone.jpg',
      width: 1600,
      height: 1200,
    } as never)
    vi.mocked(LegacyFS.getInfoAsync).mockResolvedValue({ exists: false } as never)

    await expect(compressImage('file:///tmp/orig.jpg', 'a.jpg')).rejects.toBeInstanceOf(
      FileNotFoundError,
    )
  })

  it('fallback filename когда original без extension', async () => {
    vi.mocked(ImageManipulator.manipulateAsync).mockResolvedValue({
      uri: 'file:///tmp/out.jpg',
      width: 1600,
      height: 1200,
    } as never)
    vi.mocked(LegacyFS.getInfoAsync).mockResolvedValue({ exists: true, size: 1024 } as never)

    const result = await compressImage('file:///tmp/orig.jpg', '')
    expect(result.fileName).toBe('license.jpg')
  })
})

describe('validatePdfSize', () => {
  beforeEach(() => {
    vi.mocked(LegacyFS.getInfoAsync).mockReset()
  })

  it('returns size для валидного PDF', async () => {
    vi.mocked(LegacyFS.getInfoAsync).mockResolvedValue({ exists: true, size: 2_000_000 } as never)
    expect(await validatePdfSize('file:///tmp/a.pdf')).toBe(2_000_000)
  })

  it('throws FileTooLargeError для > 10MB', async () => {
    vi.mocked(LegacyFS.getInfoAsync).mockResolvedValue({
      exists: true,
      size: 15 * 1024 * 1024,
    } as never)
    await expect(validatePdfSize('file:///tmp/big.pdf')).rejects.toBeInstanceOf(FileTooLargeError)
  })
})
