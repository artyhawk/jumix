import { Button } from '@/components/ui/button'
import { ApiError, NetworkError } from '@/lib/api/errors'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  error: unknown
  onRetry: () => void
}

/**
 * Error-view для /me и связанных screens. NetworkError — offline hint;
 * ApiError — server message; прочие — generic fallback. Кнопка retry
 * вызывает query.refetch() (или invalidate).
 */
export function MeScreenError({ error, onRetry }: Props) {
  const { title, description } = resolveMessage(error)
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Text style={styles.iconGlyph}>⚠</Text>
      </View>
      <Text style={[typography.heading3, styles.title]}>{title}</Text>
      <Text style={[typography.bodySecondary, styles.description]}>{description}</Text>
      <Button variant="secondary" onPress={onRetry}>
        Повторить
      </Button>
    </View>
  )
}

function resolveMessage(error: unknown): { title: string; description: string } {
  if (error instanceof NetworkError) {
    return {
      title: 'Нет соединения',
      description: 'Проверьте интернет-соединение и попробуйте ещё раз.',
    }
  }
  if (error instanceof ApiError) {
    return {
      title: 'Не удалось загрузить данные',
      description: error.message || 'Попробуйте ещё раз через минуту.',
    }
  }
  return {
    title: 'Что-то пошло не так',
    description: 'Попробуйте ещё раз. Если ошибка повторяется — напишите в поддержку.',
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 24,
    color: colors.danger,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.sm,
  },
})
