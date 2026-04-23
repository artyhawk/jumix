import { formatPhoneMask, phoneDigits } from '@/lib/validation/phone'
import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native'

interface PhoneInputProps {
  /** 10-digit tail (без +7). Парент-компонент держит canonical state. */
  value: string
  /** onChange отдаёт 10-digit tail (всегда only digits). */
  onChangeDigits: (digits: string) => void
  label?: string
  error?: string | null
  editable?: boolean
  autoFocus?: boolean
  containerStyle?: ViewStyle
}

/**
 * Specialized phone input для KZ. Prefix `+7` locked (не удаляется),
 * остальное маскируется в `(XXX) XXX-XX-XX`. Numeric keyboard,
 * `textContentType='telephoneNumber'` для iOS autofill из контактов.
 */
export function PhoneInput({
  value,
  onChangeDigits,
  label = 'Номер телефона',
  error,
  editable = true,
  autoFocus,
  containerStyle,
}: PhoneInputProps) {
  const displayValue = useMemo(() => formatPhoneMask(value), [value])

  const handleChange = useCallback(
    (raw: string) => {
      onChangeDigits(phoneDigits(raw))
    },
    [onChangeDigits],
  )

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
        <Text style={styles.prefix}>+7</Text>
        <TextInput
          value={displayValue}
          onChangeText={handleChange}
          keyboardType="phone-pad"
          inputMode="tel"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder="(7XX) XXX-XX-XX"
          placeholderTextColor={colors.textTertiary}
          maxLength={17} // "(XXX) XXX-XX-XX" = 15 + 2 safety
          editable={editable}
          autoFocus={autoFocus}
          style={styles.input}
          accessibilityLabel={label}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    paddingHorizontal: spacing.md,
  },
  inputRowError: {
    borderColor: colors.danger,
  },
  prefix: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
    paddingRight: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: font.size.base,
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontSize: font.size.xs,
    color: colors.danger,
  },
})
