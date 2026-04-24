import { Button } from '@/components/ui/button'
import { FilePreview } from '@/components/ui/file-preview'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SafeArea } from '@/components/ui/safe-area'
import type { LicenseContentType } from '@/lib/api/license'
import {
  FileNotFoundError,
  FileTooLargeError,
  compressImage,
  validatePdfSize,
} from '@/lib/compress'
import { formatDate, maxExpiryDate, toIsoDate, tomorrowDate, tomorrowIso } from '@/lib/format/date'
import { useUploadLicense } from '@/lib/hooks/use-upload-license'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * License upload preview modal. Receives picker result через URL params,
 * compresses/validates on mount, shows preview + expiry picker + submit.
 *
 * Three-phase orchestration инкапсулирован в useUploadLicense —
 * здесь только UI + params.
 */
export default function LicenseUploadScreen() {
  const params = useLocalSearchParams<{ uri: string; fileName: string; mimeType: string }>()
  const uri = params.uri
  const fileName = params.fileName ?? 'license'
  const mimeType = (params.mimeType ?? 'image/jpeg') as LicenseContentType

  const [compressedUri, setCompressedUri] = useState<string>(uri)
  const [compressedName, setCompressedName] = useState<string>(fileName)
  const [compressedSize, setCompressedSize] = useState<number | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(true)

  const [expiresAt, setExpiresAt] = useState<string>(() => tomorrowIso())
  const [showDatePicker, setShowDatePicker] = useState(false)

  const { upload, isUploading, progress } = useUploadLicense()

  // Compress (image) or validate size (PDF) on mount
  useEffect(() => {
    if (!uri) return
    let cancelled = false

    const process = async () => {
      try {
        setIsProcessing(true)
        setProcessError(null)

        if (mimeType === 'application/pdf') {
          const size = await validatePdfSize(uri)
          if (cancelled) return
          setCompressedSize(size)
        } else {
          const compressed = await compressImage(uri, fileName)
          if (cancelled) return
          setCompressedUri(compressed.uri)
          setCompressedName(compressed.fileName)
          setCompressedSize(compressed.size)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof FileTooLargeError) {
          setProcessError('Файл больше 10 МБ — уменьшите размер и попробуйте снова.')
        } else if (err instanceof FileNotFoundError) {
          setProcessError('Файл не найден. Попробуйте выбрать снова.')
        } else {
          setProcessError('Не удалось обработать файл.')
        }
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    }

    void process()
    return () => {
      cancelled = true
    }
  }, [uri, fileName, mimeType])

  const canSubmit = !processError && !isProcessing && !isUploading && compressedSize !== null

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    // iOS inline keeps picker open; Android modal dismisses after pick
    if (Platform.OS === 'android') setShowDatePicker(false)
    if (date) setExpiresAt(toIsoDate(date))
  }

  const handleSubmit = () => {
    upload(
      {
        fileUri: compressedUri,
        fileName: compressedName,
        mimeType: mimeType === 'image/png' ? 'image/png' : mimeType,
        expiresAt,
      },
      {
        onSuccess: () => router.back(),
      },
    )
  }

  if (!uri) {
    return (
      <SafeArea>
        <View style={styles.centered}>
          <Text style={typography.bodySecondary}>Нет данных о файле</Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <FilePreview
          uri={compressedUri}
          mimeType={mimeType}
          fileName={compressedName}
          size={compressedSize}
        />

        {isProcessing ? (
          <Text style={[typography.caption, styles.processing]}>Обработка файла…</Text>
        ) : null}

        {processError ? (
          <View style={styles.errorBox}>
            <Text style={[typography.body, styles.errorText]}>{processError}</Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Срок действия удостоверения</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDatePicker(true)}
            disabled={isUploading}
            style={({ pressed }) => [styles.dateButton, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.dateValue}>{formatDate(expiresAt)}</Text>
            <Text style={styles.dateHint}>нажмите, чтобы изменить</Text>
          </Pressable>
        </View>

        {showDatePicker ? (
          <DateTimePicker
            value={new Date(expiresAt)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={tomorrowDate()}
            maximumDate={maxExpiryDate()}
            onChange={handleDateChange}
            themeVariant="dark"
          />
        ) : null}

        {isUploading ? <ProgressBar value={progress} label="Загрузка на сервер" /> : null}

        <Text style={[typography.caption, styles.agreement]}>
          Загружая файл, я подтверждаю, что это оригинальное действующее удостоверение крановщика,
          выданное на моё имя.
        </Text>

        <View style={styles.footer}>
          <Button variant="ghost" onPress={() => router.back()} disabled={isUploading} fullWidth>
            Отмена
          </Button>
          <Button
            variant="primary"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={isUploading}
            fullWidth
          >
            Загрузить
          </Button>
        </View>
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processing: {
    textAlign: 'center',
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  errorText: {
    color: colors.danger,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  dateButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    justifyContent: 'center',
  },
  dateValue: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  dateHint: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  agreement: {
    paddingVertical: spacing.sm,
    lineHeight: font.size.sm * 1.5,
  },
  footer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
})
