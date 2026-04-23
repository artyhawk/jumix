import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OtpInput } from '@/components/ui/otp-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { SafeArea } from '@/components/ui/safe-area'
import { ApiError, isApiError, isNetworkError } from '@/lib/api/errors'
import { startRegistration, verifyRegistration } from '@/lib/api/registration'
import { toE164 } from '@/lib/validation/phone'
import { useAuthStore } from '@/stores/auth'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { isValidKzIin } from '@jumix/shared'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

/**
 * Registration screen (M1). Двухфазный flow (ADR 0004): phase 1 request OTP,
 * phase 2 verify с identity. На одном экране — UX эргономичнее чем split.
 *
 * Identity fields собираются вместе с OTP (backend `verifyRegistration`
 * ожидает и то и другое). После success → login via auth store →
 * redirect на /(tabs)/me.
 */
export default function RegisterScreen() {
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState<'identity' | 'otp'>('identity')
  const [digits, setDigits] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [iin, setIin] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const phone = toE164(digits)

  const identityValid = useMemo(
    () =>
      phone !== undefined &&
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      isValidKzIin(iin),
    [phone, firstName, lastName, iin],
  )

  async function handleSendCode() {
    if (!phone || !identityValid) return
    setLoading(true)
    setError(null)
    try {
      await startRegistration(phone)
      setStep('otp')
    } catch (err) {
      setError(resolveError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(fullCode: string) {
    if (!phone || fullCode.length !== 6) return
    setLoading(true)
    setError(null)
    try {
      const result = await verifyRegistration({
        phone,
        otp: fullCode,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        patronymic: patronymic.trim() || undefined,
        iin: iin.trim(),
      })
      await login({ access: result.accessToken, refresh: result.refreshToken }, result.user)
      // redirect автоматически через (auth)/_layout.tsx когда user появится.
    } catch (err) {
      setError(resolveError(err))
      setOtp('')
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            {step === 'identity' ? (
              <>
                <View style={styles.header}>
                  <Text style={typography.heading1}>Регистрация</Text>
                  <Text style={typography.bodySecondary}>
                    Заполните данные — отправим SMS-код для подтверждения.
                  </Text>
                </View>

                <Input
                  label="Фамилия"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  textContentType="familyName"
                  autoComplete="family-name"
                  placeholder="Иванов"
                />
                <Input
                  label="Имя"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  textContentType="givenName"
                  autoComplete="given-name"
                  placeholder="Иван"
                />
                <Input
                  label="Отчество (опционально)"
                  value={patronymic}
                  onChangeText={setPatronymic}
                  autoCapitalize="words"
                  placeholder="Иванович"
                />
                <Input
                  label="ИИН"
                  value={iin}
                  onChangeText={(v) => setIin(v.replace(/\D/g, '').slice(0, 12))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="12 цифр"
                  maxLength={12}
                />
                <PhoneInput value={digits} onChangeDigits={setDigits} />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Button
                  variant="primary"
                  size="lg"
                  onPress={handleSendCode}
                  loading={loading}
                  disabled={!identityValid}
                  fullWidth
                >
                  Получить код
                </Button>

                <Pressable
                  style={styles.link}
                  onPress={() => router.back()}
                  accessibilityRole="link"
                >
                  <Text style={[typography.caption, styles.linkText]}>← Уже есть аккаунт</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={typography.heading1}>Код из SMS</Text>
                  <Text style={typography.bodySecondary}>
                    Введите 6-значный код. После подтверждения платформа рассмотрит вашу заявку.
                  </Text>
                </View>

                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  onComplete={handleVerify}
                  autoFocus
                  editable={!loading}
                  error={Boolean(error)}
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Button
                  variant="primary"
                  size="lg"
                  onPress={() => handleVerify(otp)}
                  loading={loading}
                  disabled={otp.length !== 6}
                  fullWidth
                >
                  Завершить регистрацию
                </Button>

                <Pressable
                  style={styles.link}
                  onPress={() => setStep('identity')}
                  disabled={loading}
                  accessibilityRole="link"
                >
                  <Text style={[typography.caption, styles.linkText]}>← Изменить данные</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeArea>
  )
}

function resolveError(err: unknown): string {
  if (isNetworkError(err)) return 'Нет соединения. Проверьте интернет.'
  if (isApiError(err)) {
    if (err.code === 'PHONE_ALREADY_REGISTERED') {
      return 'Этот номер уже зарегистрирован. Войдите через SMS.'
    }
    if (err.code === 'IIN_ALREADY_EXISTS') {
      return 'Крановщик с таким ИИН уже есть на платформе.'
    }
    if (err.code === 'SMS_CODE_INVALID') return 'Неверный код.'
    if (err.code === 'SMS_CODE_EXPIRED') return 'Код просрочен. Запросите новый.'
    if (err.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Слишком много попыток. Подождите.'
    }
    return err.message
  }
  if (err instanceof ApiError) return err.message
  return 'Не удалось зарегистрироваться.'
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.layer0,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center',
  },
  link: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.textSecondary,
  },
})
