import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Alert, Linking } from 'react-native'

export type LicenseMimeType = 'image/jpeg' | 'image/png' | 'application/pdf'

export interface PickedFile {
  uri: string
  fileName: string
  mimeType: LicenseMimeType
  size?: number
}

/**
 * Native runtime permission flow. При denial — Alert с кнопкой «Настройки»
 * → Linking.openSettings() → user manually enables permission.
 *
 * Returns true если permission granted (или уже был), false — если denied.
 */
async function ensureCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status === 'granted') return true

  Alert.alert(
    'Нет доступа к камере',
    'Чтобы сфотографировать удостоверение, разрешите доступ к камере в настройках.',
    [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Настройки', onPress: () => void Linking.openSettings() },
    ],
  )
  return false
}

async function ensureGalleryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status === 'granted') return true

  Alert.alert(
    'Нет доступа к галерее',
    'Чтобы выбрать фото удостоверения, разрешите доступ к галерее в настройках.',
    [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Настройки', onPress: () => void Linking.openSettings() },
    ],
  )
  return false
}

function normalizeImageMime(asset: ImagePicker.ImagePickerAsset): LicenseMimeType {
  const mime = asset.mimeType
  if (mime === 'image/png') return 'image/png'
  // iOS иногда возвращает image/heic/heif — manipulator всё равно конвертит в JPEG
  return 'image/jpeg'
}

export async function pickFromCamera(): Promise<PickedFile | null> {
  const granted = await ensureCameraPermission()
  if (!granted) return null

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  })

  if (result.canceled || result.assets.length === 0) return null

  const asset = result.assets[0]
  if (!asset) return null
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: normalizeImageMime(asset),
    size: asset.fileSize,
  }
}

export async function pickFromGallery(): Promise<PickedFile | null> {
  const granted = await ensureGalleryPermission()
  if (!granted) return null

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  })

  if (result.canceled || result.assets.length === 0) return null

  const asset = result.assets[0]
  if (!asset) return null
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: normalizeImageMime(asset),
    size: asset.fileSize,
  }
}

export async function pickFromDocuments(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  })

  if (result.canceled || result.assets.length === 0) return null

  const asset = result.assets[0]
  if (!asset) return null
  return {
    uri: asset.uri,
    fileName: asset.name,
    mimeType: 'application/pdf',
    size: asset.size,
  }
}
