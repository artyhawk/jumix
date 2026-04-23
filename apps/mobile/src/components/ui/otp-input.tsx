import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { useCallback, useEffect, useRef } from 'react'
import {
  type NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from 'react-native'

const LENGTH = 6

interface OtpInputProps {
  value: string
  onChange: (code: string) => void
  /** Вызывается когда введено LENGTH цифр (полный код). */
  onComplete?: (code: string) => void
  autoFocus?: boolean
  error?: boolean
  editable?: boolean
}

/**
 * 6-box OTP input для SMS кодов. Каждая клетка — отдельный TextInput,
 * auto-advance на input + backspace-to-previous. `textContentType` +
 * `autoComplete` включает iOS SMS autofill и Android SMS Retriever.
 *
 * Design-system: 44pt min touch, brand-500 border в focused (current)
 * клетке, danger border если `error`. Paste полного кода фаерит
 * onChange + onComplete сразу.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  error,
  editable = true,
}: OtpInputProps) {
  const refs = useRef<Array<TextInput | null>>([])
  const digits = padDigits(value)

  useEffect(() => {
    if (autoFocus) {
      // Focus first empty клетку (или last если всё заполнено)
      const targetIdx = digits.findIndex((d) => !d)
      refs.current[targetIdx === -1 ? LENGTH - 1 : targetIdx]?.focus()
    }
  }, [autoFocus, digits])

  const setDigit = useCallback(
    (idx: number, raw: string) => {
      // iOS SMS autofill paste-ит полный код. Обрабатываем paste отдельно.
      const pasted = raw.replace(/\D/g, '')
      if (pasted.length >= LENGTH) {
        const next = pasted.slice(0, LENGTH)
        onChange(next)
        if (next.length === LENGTH) onComplete?.(next)
        // focus last клетку
        refs.current[LENGTH - 1]?.focus()
        return
      }
      const singleChar = pasted.slice(0, 1)
      const nextDigits = [...digits]
      nextDigits[idx] = singleChar
      const next = nextDigits.join('')
      onChange(next.replace(/\s/g, ''))
      if (singleChar && idx < LENGTH - 1) {
        refs.current[idx + 1]?.focus()
      }
      if (next.replace(/\s/g, '').length === LENGTH) {
        onComplete?.(next.replace(/\s/g, ''))
      }
    },
    [digits, onChange, onComplete],
  )

  const handleKeyPress = useCallback(
    (idx: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Backspace' && !digits[idx] && idx > 0) {
        // Пустая клетка + backspace → прыгаем назад и стираем там.
        refs.current[idx - 1]?.focus()
        const nextDigits = [...digits]
        nextDigits[idx - 1] = ''
        onChange(nextDigits.join('').replace(/\s/g, ''))
      }
    },
    [digits, onChange],
  )

  return (
    <View style={styles.row} accessibilityLabel="Код подтверждения">
      {digits.map((d, idx) => (
        <TextInput
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list, позиция = identity
          key={`otp-${idx}`}
          ref={(el) => {
            refs.current[idx] = el
          }}
          value={d}
          onChangeText={(raw) => setDigit(idx, raw)}
          onKeyPress={(e) => handleKeyPress(idx, e)}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={idx === 0 ? LENGTH : 1} // paste detection только в первой клетке
          editable={editable}
          selectTextOnFocus
          style={[styles.box, d ? styles.boxFilled : null, error ? styles.boxError : null]}
          accessibilityLabel={`Цифра ${idx + 1}`}
        />
      ))}
    </View>
  )
}

function padDigits(value: string): string[] {
  const clean = value.replace(/\D/g, '').slice(0, LENGTH)
  const result = new Array(LENGTH).fill('') as string[]
  for (let i = 0; i < clean.length; i++) {
    result[i] = clean[i] ?? ''
  }
  return result
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignSelf: 'center',
  },
  box: {
    width: touchTarget.min,
    height: touchTarget.min + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    color: colors.textPrimary,
    textAlign: 'center',
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
  },
  boxFilled: {
    borderColor: colors.brand500,
    backgroundColor: colors.layer2,
  },
  boxError: {
    borderColor: colors.danger,
  },
})
