import { colors, radius, spacing } from '@/theme/tokens'
import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'

export type CardTone = 'neutral' | 'success' | 'danger' | 'warning'

interface CardProps {
  children: ReactNode
  tone?: CardTone
  style?: ViewStyle | ViewStyle[]
}

/**
 * Surface container для content-блоков на /me и related screens.
 * tone — tinted border + subtle bg, применяется когда card обозначает
 * state (canWork danger / success, rejection reason).
 */
export function Card({ children, tone = 'neutral', style }: CardProps) {
  const toneStyle = TONE_STYLES[tone]
  return <View style={[styles.base, toneStyle, style as ViewStyle]}>{children}</View>
}

const TONE_STYLES: Record<CardTone, ViewStyle> = {
  neutral: {
    backgroundColor: colors.layer1,
    borderColor: colors.borderSubtle,
  },
  success: {
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  danger: {
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  warning: {
    backgroundColor: 'rgba(234, 179, 8, 0.05)',
    borderColor: 'rgba(234, 179, 8, 0.35)',
  },
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
})
