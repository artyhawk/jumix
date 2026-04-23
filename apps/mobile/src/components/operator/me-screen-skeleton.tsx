import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { spacing } from '@/theme/tokens'
import { StyleSheet, View } from 'react-native'

/**
 * Skeleton layout матчит реальный /me screen shape — status card (hero),
 * identity card (avatar + rows), license card (header + body), memberships
 * card (header + N rows). Статические прямоугольники, без shimmer в MVP.
 */
export function MeScreenSkeleton() {
  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.row}>
          <Skeleton width={44} height={44} borderRadius={22} />
          <View style={styles.stack}>
            <Skeleton width="70%" height={20} />
            <Skeleton width="90%" height={14} />
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <Skeleton width={64} height={64} borderRadius={32} />
          <View style={styles.stack}>
            <Skeleton width="60%" height={18} />
            <Skeleton width={120} height={16} />
          </View>
        </View>
        <View style={styles.details}>
          <Skeleton width="100%" height={14} />
          <Skeleton width="100%" height={14} />
        </View>
      </Card>

      <Card>
        <Skeleton width={140} height={16} />
        <View style={styles.stack}>
          <Skeleton width="100%" height={16} />
          <Skeleton width="50%" height={12} />
        </View>
      </Card>

      <Card>
        <Skeleton width={120} height={14} />
        <View style={styles.listStack}>
          <Skeleton width="100%" height={72} />
          <Skeleton width="100%" height={72} />
        </View>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  stack: {
    flex: 1,
    gap: spacing.xs,
  },
  details: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  listStack: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
})
