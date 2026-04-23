import { Button } from '@/components/ui/button'
import { PhoneInput } from '@/components/ui/phone-input'
import { SafeArea } from '@/components/ui/safe-area'
import { requestSmsCode } from '@/lib/api/auth'
import { ApiError, isApiError, isNetworkError } from '@/lib/api/errors'
import { toE164 } from '@/lib/validation/phone'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

/**
 * Login screen (M1). Phone → SMS code request → navigate в verify-otp.
 *
 * UX: валидный 10-digit → кнопка enabled → запрос OTP → нав на /verify-otp
 * c `phone` param. Ошибка — inline message (не toast — persistent UX для
 * обучения правильному формату).
 *
 * Registration CTA внизу — перенаправляет в /register для новых operators.
 */
export default function LoginScreen() {
  const [digits, setDigits] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phone = toE164(digits)
  const canSubmit = phone !== undefined && !loading

  async function handleRequestCode() {
    if (!phone) return
    setLoading(true)
    setError(null)
    try {
      await requestSmsCode(phone)
      router.push({ pathname: '/(auth)/verify-otp', params: { phone } })
    } catch (err) {
      setError(resolveError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeArea>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={typography.heading1}>Вход</Text>
            <Text style={typography.bodySecondary}>
              Введите номер телефона — отправим SMS-код подтверждения.
            </Text>
          </View>

          <PhoneInput
            value={digits}
            onChangeDigits={(v) => {
              setDigits(v)
              if (error) setError(null)
            }}
            error={error}
            autoFocus
          />

          <Button
            variant="primary"
            size="lg"
            onPress={handleRequestCode}
            loading={loading}
            disabled={!canSubmit}
            fullWidth
          >
            Получить код
          </Button>

          <Pressable
            style={styles.registerLink}
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="link"
          >
            <Text style={typography.bodySecondary}>
              Нет аккаунта? <Text style={styles.registerLinkAccent}>Зарегистрироваться</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeArea>
  )
}

function resolveError(err: unknown): string {
  if (isNetworkError(err)) return 'Нет соединения. Проверьте интернет.'
  if (isApiError(err)) {
    if (err.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Слишком много попыток. Подождите перед следующим запросом.'
    }
    if (err.code === 'INVALID_PHONE' || err.status === 422) {
      return 'Неверный формат номера.'
    }
    return err.message
  }
  if (err instanceof ApiError) return err.message
  return 'Не удалось отправить код. Попробуйте ещё раз.'
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.layer0,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  registerLink: {
    marginTop: spacing.md,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  registerLinkAccent: {
    color: colors.brand500,
  },
})
