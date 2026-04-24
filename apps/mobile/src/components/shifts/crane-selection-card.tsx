import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { AvailableCrane } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  crane: AvailableCrane
  selected?: boolean
  onPress: () => void
}

/**
 * Card для выбора крана на «Начать смену» экране. Selected state —
 * brand-border (только этот один active-state indicator допускает brand
 * на mobile ≤5% rule).
 */
export function CraneSelectionCard({ crane, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.container, selected && styles.selected]}
    >
      <View style={styles.headerRow}>
        <Text style={[typography.body, styles.model]}>{crane.model}</Text>
        {crane.inventoryNumber ? (
          <Text style={styles.inventory}>{crane.inventoryNumber}</Text>
        ) : null}
      </View>
      <Text style={styles.meta}>
        {CRANE_TYPE_LABELS[crane.type]} · {crane.capacityTon} т
      </Text>
      <Text style={styles.meta}>{crane.site.name}</Text>
    </Pressable>
  )
}

const CRANE_TYPE_LABELS: Record<AvailableCrane['type'], string> = {
  tower: 'Башенный',
  mobile: 'Мобильный',
  crawler: 'Гусеничный',
  overhead: 'Мостовой',
}

const styles = StyleSheet.create({
  container: {
    minHeight: touchTarget.min + 16,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    gap: 2,
  },
  selected: {
    borderColor: colors.brand500,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  model: {
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  inventory: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontFamily: 'monospace',
  },
  meta: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
})
