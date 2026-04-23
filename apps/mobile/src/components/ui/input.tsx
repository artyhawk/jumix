import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { forwardRef } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native'

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  error?: string | null
  hint?: string
  containerStyle?: ViewStyle
}

/**
 * Base TextInput с label + error + hint. Mobile-first — 44pt min height.
 * Focus ring симулируется через border color change (RN не поддерживает
 * box-shadow одинаково на всех платформах).
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, containerStyle, ...textInputProps },
  ref,
) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, error ? styles.inputError : null]}
        {...textInputProps}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  input: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.size.base,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: font.size.xs,
    color: colors.danger,
  },
  hintText: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
  },
})
