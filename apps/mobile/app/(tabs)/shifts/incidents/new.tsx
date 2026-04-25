import { SeverityButton } from '@/components/incidents/severity-button'
import { IncidentTypeCard } from '@/components/incidents/type-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SafeArea } from '@/components/ui/safe-area'
import { type CompressedImage, FileTooLargeError, compressImage } from '@/lib/compress'
import { type IncidentPhotoToUpload, useCreateIncident } from '@/lib/hooks/use-incidents'
import { useMyActiveShift } from '@/lib/hooks/use-shifts'
import { getRecentLocationForIncident } from '@/lib/incidents/location'
import { pickFromCamera, pickFromGallery } from '@/lib/pickers'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { useActionSheet } from '@expo/react-native-action-sheet'
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  type IncidentSeverity,
  type IncidentType,
} from '@jumix/shared'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

const MAX_PHOTOS = 5
const MIN_DESCRIPTION_LENGTH = 10

/**
 * Create incident form (M6, ADR 0008). Modal presentation.
 *
 * Auto-attached:
 *   - shiftId — из useMyActiveShift (если есть active/paused shift)
 *   - latitude/longitude — из M5 SQLite queue (recent ping ≤5min)
 *
 * Photos — до 5 штук, compress → upload через three-phase orchestration
 * (useCreateIncident).
 */
export default function NewIncidentScreen() {
  const activeShift = useMyActiveShift()
  const create = useCreateIncident()
  const { showActionSheetWithOptions } = useActionSheet()

  const [type, setType] = useState<IncidentType | null>(null)
  const [severity, setSeverity] = useState<IncidentSeverity>('warning')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<IncidentPhotoToUpload[]>([])
  const [autoLocation, setAutoLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)

  // Auto-attach GPS once при mount или когда active shift меняется.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const shiftId = activeShift.data?.id
      const recent = await getRecentLocationForIncident(shiftId)
      if (!cancelled && recent) {
        setAutoLocation({ latitude: recent.latitude, longitude: recent.longitude })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeShift.data?.id])

  const handleAddPhoto = () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Достигнут лимит', `Можно прикрепить до ${MAX_PHOTOS} фото.`)
      return
    }
    showActionSheetWithOptions(
      {
        options: ['Сделать фото', 'Выбрать из галереи', 'Отмена'],
        cancelButtonIndex: 2,
      },
      async (selectedIndex) => {
        if (selectedIndex === 2 || selectedIndex === undefined) return
        try {
          const picked = selectedIndex === 0 ? await pickFromCamera() : await pickFromGallery()
          if (!picked) return
          let compressed: CompressedImage
          try {
            compressed = await compressImage(picked.uri, picked.fileName)
          } catch (err) {
            if (err instanceof FileTooLargeError) {
              Alert.alert('Файл слишком большой', 'Размер фото не должен превышать 10 МБ.')
              return
            }
            throw err
          }
          setPhotos((prev) => [
            ...prev,
            {
              fileUri: compressed.uri,
              fileName: compressed.fileName,
              mimeType: compressed.mimeType,
            },
          ])
        } catch (err) {
          console.warn('photo pick/compress failed', err)
          Alert.alert('Не удалось добавить фото', 'Попробуйте ещё раз.')
        }
      },
    )
  }

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const trimmedDescription = description.trim()
  const canSubmit =
    type !== null && trimmedDescription.length >= MIN_DESCRIPTION_LENGTH && !create.isCreating

  const handleSubmit = () => {
    if (!type) return
    if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) return

    create.create(
      {
        type,
        severity,
        description: trimmedDescription,
        photos,
        shiftId: activeShift.data?.id,
        latitude: autoLocation?.latitude,
        longitude: autoLocation?.longitude,
      },
      {
        onSuccess: () => {
          router.back()
        },
      },
    )
  }

  const progressPct = (() => {
    const { progress } = create
    if (progress.totalPhotos === 0) return 0
    const completed = progress.uploadedCount + progress.currentPhotoFraction
    return Math.min(1, completed / progress.totalPhotos)
  })()

  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Тип</Text>
            <View style={styles.typeList}>
              {INCIDENT_TYPES.map((t) => (
                <IncidentTypeCard
                  key={t}
                  type={t}
                  selected={type === t}
                  onPress={() => setType(t)}
                />
              ))}
            </View>
          </View>

          {/* Severity selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Серьёзность</Text>
            <View style={styles.severityRow}>
              {INCIDENT_SEVERITIES.map((s) => (
                <SeverityButton
                  key={s}
                  severity={s}
                  selected={severity === s}
                  onPress={() => setSeverity(s)}
                />
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Input
              label="Описание"
              value={description}
              onChangeText={setDescription}
              placeholder="Опишите что произошло (минимум 10 символов)"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={2000}
              hint={
                trimmedDescription.length > 0 && trimmedDescription.length < MIN_DESCRIPTION_LENGTH
                  ? `Ещё ${MIN_DESCRIPTION_LENGTH - trimmedDescription.length} символов`
                  : undefined
              }
            />
          </View>

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Фото ({photos.length}/{MAX_PHOTOS})
            </Text>
            <View style={styles.photoList}>
              {photos.map((p, i) => (
                <View key={`${p.fileUri}-${i}`} style={styles.photoRow}>
                  <Text style={styles.photoName} numberOfLines={1}>
                    {p.fileName}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemovePhoto(i)}
                    accessibilityLabel={`Удалить фото ${i + 1}`}
                  >
                    <Text style={styles.photoRemove}>Удалить</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <Button variant="secondary" onPress={handleAddPhoto} fullWidth>
                  Добавить фото
                </Button>
              ) : null}
            </View>
          </View>

          {/* Auto-attach hint */}
          {autoLocation || activeShift.data ? (
            <View style={styles.hintBox}>
              {activeShift.data ? (
                <Text style={styles.hintText}>Сообщение будет привязано к текущей смене</Text>
              ) : null}
              {autoLocation ? (
                <Text style={styles.hintText}>📍 Координаты прикреплены автоматически</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {create.isCreating && create.progress.totalPhotos > 0 ? (
            <View style={styles.progressBlock}>
              <Text style={styles.progressText}>
                Загружаем фото{' '}
                {Math.min(create.progress.uploadedCount + 1, create.progress.totalPhotos)}/
                {create.progress.totalPhotos}
              </Text>
              <ProgressBar value={progressPct} />
            </View>
          ) : null}
          <Button
            variant="primary"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={create.isCreating}
            fullWidth
          >
            Отправить
          </Button>
        </View>
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  typeList: {
    gap: spacing.xs,
  },
  severityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoList: {
    gap: spacing.sm,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    gap: spacing.sm,
  },
  photoName: {
    flex: 1,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  photoRemove: {
    fontSize: font.size.sm,
    color: colors.danger,
    fontWeight: font.weight.medium,
  },
  hintBox: {
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.layer2,
    gap: spacing.xs,
  },
  hintText: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.sm,
  },
  progressBlock: {
    gap: spacing.xs,
  },
  progressText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})

/* Avoid unused style warning — `typography` imported для consistency. */
void typography
