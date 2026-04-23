import { MeIdentityCard } from '@/components/operator/me-identity-card'
import { MeLicenseCard } from '@/components/operator/me-license-card'
import { MeMembershipsSummary } from '@/components/operator/me-memberships-summary'
import { MeScreenError } from '@/components/operator/me-screen-error'
import { MeScreenSkeleton } from '@/components/operator/me-screen-skeleton'
import { MeStatusCard } from '@/components/operator/me-status-card'
import { Button } from '@/components/ui/button'
import { SafeArea } from '@/components/ui/safe-area'
import { useMeStatus } from '@/lib/hooks/use-me'
import { useAuthStore } from '@/stores/auth'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { MeStatusResponse } from '@jumix/shared'
import { router } from 'expo-router'
import { useCallback } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * Operator landing screen (M2). Shows canWork indicator + identity +
 * license quick-glance + memberships summary. Pull-to-refresh invalidates
 * /me/status query.
 *
 * Loading → MeScreenSkeleton, error → MeScreenError с retry.
 */
export default function MeScreen() {
  const query = useMeStatus()
  const logout = useAuthStore((s) => s.logout)

  const handleRefresh = useCallback(() => {
    void query.refetch()
  }, [query])

  if (query.isLoading) {
    return (
      <SafeArea edges={['bottom']}>
        <MeScreenSkeleton />
      </SafeArea>
    )
  }

  if (query.isError || !query.data) {
    return (
      <SafeArea edges={['bottom']}>
        <MeScreenError error={query.error} onRetry={handleRefresh} />
      </SafeArea>
    )
  }

  return (
    <SafeArea edges={['bottom']}>
      <MeScreenContent
        data={query.data}
        isRefreshing={query.isFetching && !query.isLoading}
        onRefresh={handleRefresh}
        onLogout={() => void logout()}
      />
    </SafeArea>
  )
}

function MeScreenContent({
  data,
  isRefreshing,
  onRefresh,
  onLogout,
}: {
  data: MeStatusResponse
  isRefreshing: boolean
  onRefresh: () => void
  onLogout: () => void
}) {
  const { profile, memberships, licenseStatus, canWork, canWorkReasons } = data

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand500}
          colors={[colors.brand500]}
        />
      }
    >
      <View style={styles.greeting}>
        <Text style={typography.caption}>Здравствуйте,</Text>
        <Text style={typography.heading2}>{profile.firstName}</Text>
      </View>

      <MeStatusCard canWork={canWork} reasons={canWorkReasons} />

      <MeIdentityCard profile={profile} />

      <MeLicenseCard
        profile={profile}
        licenseStatus={licenseStatus}
        onManagePress={() => router.push('/(tabs)/license')}
      />

      <MeMembershipsSummary
        memberships={memberships}
        onViewAll={() => router.push('/memberships')}
        onMembershipPress={(m) =>
          router.push({ pathname: '/memberships/[id]', params: { id: m.id } })
        }
      />

      <View style={styles.footer}>
        <Button variant="ghost" onPress={onLogout} fullWidth>
          Выйти
        </Button>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  greeting: {
    gap: 2,
  },
  footer: {
    marginTop: spacing.lg,
  },
})
