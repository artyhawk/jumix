import { LicenseCurrentCard } from '@/components/operator/license-current-card'
import { LicenseInfoSection } from '@/components/operator/license-info-section'
import { LicenseWarningBanner } from '@/components/operator/license-warning-banner'
import { MeScreenError } from '@/components/operator/me-screen-error'
import { MeScreenSkeleton } from '@/components/operator/me-screen-skeleton'
import { SafeArea } from '@/components/ui/safe-area'
import { useMeStatus } from '@/lib/hooks/use-me'
import { type PickedFile, pickFromCamera, pickFromDocuments, pickFromGallery } from '@/lib/pickers'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { useActionSheet } from '@expo/react-native-action-sheet'
import { router } from 'expo-router'
import { useCallback } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * Main license screen. Shows current state + warning (conditional) + info.
 * Upload CTA → ActionSheet (camera/gallery/documents) → picker result →
 * navigate к /license/upload modal с params.
 */
export default function LicenseScreen() {
  const query = useMeStatus()
  const { showActionSheetWithOptions } = useActionSheet()

  const handleUpload = useCallback(() => {
    const options = ['Сделать фото', 'Выбрать из галереи', 'Выбрать файл (PDF)', 'Отмена']
    const cancelButtonIndex = 3

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: 'Загрузка удостоверения',
        // iOS tint для action buttons (ignored on Android)
        tintColor: Platform.OS === 'ios' ? colors.brand500 : undefined,
      },
      async (selectedIndex) => {
        let picked: PickedFile | null = null
        if (selectedIndex === 0) picked = await pickFromCamera()
        else if (selectedIndex === 1) picked = await pickFromGallery()
        else if (selectedIndex === 2) picked = await pickFromDocuments()

        if (picked) {
          router.push({
            pathname: '/(tabs)/license/upload',
            params: {
              uri: picked.uri,
              fileName: picked.fileName,
              mimeType: picked.mimeType,
            },
          })
        }
      },
    )
  }, [showActionSheetWithOptions])

  if (query.isLoading) {
    return (
      <SafeArea edges={['top', 'bottom']}>
        <MeScreenSkeleton />
      </SafeArea>
    )
  }

  if (query.isError || !query.data) {
    return (
      <SafeArea edges={['top', 'bottom']}>
        <MeScreenError error={query.error} onRetry={() => void query.refetch()} />
      </SafeArea>
    )
  }

  const { profile, licenseStatus } = query.data

  return (
    <SafeArea edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={typography.caption}>Ваши документы</Text>
          <Text style={typography.heading2}>Удостоверение</Text>
        </View>

        <LicenseCurrentCard
          licenseStatus={licenseStatus}
          licenseVersion={profile.licenseVersion ?? null}
          licenseExpiresAt={profile.licenseExpiresAt}
          licenseUrl={profile.licenseUrl}
          onUploadPress={handleUpload}
        />

        <LicenseWarningBanner status={licenseStatus} expiresAt={profile.licenseExpiresAt} />

        <LicenseInfoSection />
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: 2,
    marginBottom: spacing.xs,
  },
})
