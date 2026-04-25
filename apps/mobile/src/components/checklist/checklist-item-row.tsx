import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { CHECKLIST_ITEM_LABELS, type ChecklistItemKey } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  itemKey: ChecklistItemKey
  checked: boolean
  hasPhoto: boolean
  hasNotes: boolean
  onToggle: () => void
  /**
   * Long-press handler. Если undefined — gesture не привязан, что
   * правильно когда photo+notes flow ещё не реализован (M6-b minimal):
   * не учим operator'а гесту, который покажет «coming later».
   * Полный flow — backlog «Mobile safety photo+notes per checklist item».
   */
  onLongPress?: () => void
}

/**
 * Single row в pre-shift checklist screen (M6, ADR 0008). Tap — toggle
 * checked state. Long-press (когда handler задан) — opens action sheet
 * с photo/notes options.
 *
 * Visual state:
 *   - unchecked: grey border, empty checkbox
 *   - checked: success-tinted border + filled green checkmark
 * Photo/notes attachments — small icon indicators в правом углу
 * (рендерятся based on data, независимо от long-press handler).
 *
 * Touch target ≥ 44dp (touchTarget.min). Whole row pressable, не только
 * checkbox — UX baseline для one-handed-with-gloves use.
 */
export function ChecklistItemRow({
  itemKey,
  checked,
  hasPhoto,
  hasNotes,
  onToggle,
  onLongPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${CHECKLIST_ITEM_LABELS[itemKey]}${checked ? ', проверено' : ''}`}
      accessibilityHint={onLongPress ? 'Долгое нажатие — добавить фото или заметку' : undefined}
      onPress={onToggle}
      onLongPress={onLongPress}
      style={[styles.container, checked && styles.containerChecked]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <View style={styles.body}>
        <Text style={[typography.body, styles.label]}>{CHECKLIST_ITEM_LABELS[itemKey]}</Text>
        {hasPhoto || hasNotes ? (
          <View style={styles.indicators}>
            {hasPhoto ? <Text style={styles.indicatorIcon}>📷</Text> : null}
            {hasNotes ? <Text style={styles.indicatorIcon}>📝</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
  },
  containerChecked: {
    borderColor: colors.success,
    backgroundColor: colors.layer1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: font.weight.bold,
    lineHeight: 14,
  },
  indicatorIcon: {
    fontSize: 14,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    flexShrink: 1,
  },
  indicators: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
})
