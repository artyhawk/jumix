import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

interface EmptyStateProps {
  /** Пиктограмма / emoji / иконка. Рендерится по центру. */
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onPress: () => void }
}

/**
 * Inline empty-state. Используется в sections (memberships summary) и
 * full-screen (memberships list без данных). Не навязывает padding —
 * parent container задаёт.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={[typography.heading3, styles.title]}>{title}</Text>
      {description ? (
        <Text style={[typography.bodySecondary, styles.description]}>{description}</Text>
      ) : null}
      {action ? (
        <View style={styles.actionWrap}>
          <Button variant="secondary" onPress={action.onPress}>
            {action.label}
          </Button>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
  },
  actionWrap: {
    marginTop: spacing.md,
  },
})
