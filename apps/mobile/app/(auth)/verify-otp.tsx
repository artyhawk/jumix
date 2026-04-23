import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/otp-input'
import { SafeArea } from '@/components/ui/safe-area'
import { requestSmsCode, verifySmsCode } from '@/lib/api/auth'
import { ApiError, isApiError, isNetworkError } from '@/lib/api/errors'
import { useAuthStore } from '@/stores/auth'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

const RESEND_COOLDOWN_SEC = 30

/**
 * OTP verification screen (M1). `phone` из route params. 6-digit input,
 * auto-submit при complete, resend timer 30 сек.
 */
export default function VerifyOtpScreen() {
  const params = useLocalSearchParams<{ phone?: string }>()
  const phone = typeof params.phone === 'string' ? params.phone : undefined

  const login = useAuthStore((s) => s.login)

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SEC)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setInterval(() => setResendIn((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(t)
  }, [resendIn])

  useEffect(() => {
    if (!phone) {
      // Unreachable (login роутит с phone); если кто-то открыл screen напрямую —
      // возвращаем на login.
      router.replace('/(auth)/login')
    }
  }, [phone])

  async function handleSubmit(fullCode: string) {
    if (!phone) return
    setLoading(true)
    setError(null)
    try {
      const result = await verifySmsCode({ phone, code: fullCode })
      await login({ access: result.accessToken, refresh: result.refreshToken }, result.user)
      // Redirect в /(tabs)/me handled авт. через (auth)/_layout когда user появится.
    } catch (err) {
      setError(resolveError(err))
      // Clear код чтобы пользователь мог повторить
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!phone || resendIn > 0) return
    setResending(true)
    setError(null)
    try {
      await requestSmsCode(phone)
      setResendIn(RESEND_COOLDOWN_SEC)
      setCode('')
    } catch (err) {
      setError(resolveError(err))
    } finally {
      setResending(false)
    }
  }

  if (!phone) return null

  return (
    <SafeArea>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={typography.heading1}>Код из SMS</Text>
            <Text style={typography.bodySecondary}>
              Отправили код на {formatMaskedPhone(phone)}. Введите 6 цифр.
            </Text>
          </View>

          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={handleSubmit}
            autoFocus
            error={Boolean(error)}
            editable={!loading}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button
              variant="primary"
              size="lg"
              onPress={() => handleSubmit(code)}
              loading={loading}
              disabled={code.length !== 6}
              fullWidth
            >
              Войти
            </Button>

            <Pressable
              style={styles.resend}
              onPress={handleResend}
              disabled={resendIn > 0 || resending}
              accessibilityRole="button"
            >
              <Text
                style={[
                  typography.caption,
                  resendIn > 0 ? styles.resendDisabled : styles.resendActive,
                ]}
              >
                {resendIn > 0
                  ? `Получить новый код через ${resendIn} сек`
                  : resending
                    ? 'Отправляем...'
                    : 'Получить новый код'}
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.back()} style={styles.backLink} accessibilityRole="link">
            <Text style={[typography.caption, styles.backLinkText]}>← Изменить номер</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeArea>
  )
}

function formatMaskedPhone(phone: string): string {
  // "+77010001122" → "+7 *** *** XX 22"
  if (!phone.startsWith('+7') || phone.length !== 12) return phone
  return `+7 *** *** ${phone.slice(-4, -2)} ${phone.slice(-2)}`
}

function resolveError(err: unknown): string {
  if (isNetworkError(err)) return 'Нет соединения. Проверьте интернет.'
  if (isApiError(err)) {
    if (err.code === 'SMS_CODE_INVALID') return 'Неверный код. Попробуйте ещё раз.'
    if (err.code === 'SMS_CODE_EXPIRED') return 'Код просрочен. Запросите новый.'
    if (err.code === 'USER_NOT_REGISTERED') {
      return 'Аккаунт не найден. Зарегистрируйтесь сначала.'
    }
    if (err.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Слишком много попыток. Подождите 15 минут.'
    }
    return err.message
  }
  if (err instanceof ApiError) return err.message
  return 'Не удалось подтвердить код.'
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
  errorText: {
    color: colors.danger,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.md,
  },
  resend: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  resendActive: {
    color: colors.brand500,
  },
  resendDisabled: {
    color: colors.textTertiary,
  },
  backLink: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  backLinkText: {
    color: colors.textSecondary,
  },
})
