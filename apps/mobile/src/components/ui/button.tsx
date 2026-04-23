import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  onPress: () => void
  children: string
  fullWidth?: boolean
  testID?: string
}

/**
 * Primary action button. Mobile-first: 44pt min touch target всегда.
 * Variants match web button.tsx (primary/secondary/ghost/danger) — semantic
 * colors консистентны между платформами.
 *
 * Pressable press-feedback через `pressed` state (opacity tweak). Нет
 * scale animation — стабильнее на low-end Android.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onPress,
  children,
  fullWidth,
  testID,
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading)
  const variantStyles = useMemo(
    () => buildVariantStyles(variant, isDisabled),
    [variant, isDisabled],
  )

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        variantStyles.container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={variantStyles.label.color ?? colors.textPrimary} />
        ) : (
          <Text style={[styles.label, variantStyles.label, size === 'lg' && styles.labelLg]}>
            {children}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  md: {
    paddingVertical: spacing.sm,
  },
  lg: {
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: font.size.base,
    fontWeight: font.weight.semibold,
  },
  labelLg: {
    fontSize: font.size.lg,
  },
})

function buildVariantStyles(
  variant: ButtonVariant,
  disabled: boolean,
): { container: ViewStyle; label: TextStyle } {
  if (disabled) {
    return {
      container: {
        backgroundColor: colors.layer3,
        borderColor: colors.borderSubtle,
        opacity: 0.5,
      },
      label: { color: colors.textTertiary },
    }
  }
  switch (variant) {
    case 'primary':
      return {
        container: {
          backgroundColor: colors.brand500,
          borderColor: colors.brand500,
        },
        label: { color: colors.textInverse },
      }
    case 'secondary':
      return {
        container: {
          backgroundColor: colors.layer3,
          borderColor: colors.borderDefault,
        },
        label: { color: colors.textPrimary },
      }
    case 'ghost':
      return {
        container: {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        },
        label: { color: colors.textSecondary },
      }
    case 'danger':
      return {
        container: {
          backgroundColor: colors.danger,
          borderColor: colors.danger,
        },
        label: { color: colors.textPrimary },
      }
  }
}
