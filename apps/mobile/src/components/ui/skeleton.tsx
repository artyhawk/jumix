import { colors, radius } from '@/theme/tokens'
import { StyleSheet, View, type ViewStyle } from 'react-native'

interface SkeletonProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle | ViewStyle[]
}

/**
 * Placeholder-прямоугольник для loading states. Статический (без pulse)
 * для MVP — добавление Reanimated-based shimmer в backlog. Static
 * skeletons читаются как loading благодаря shape + позиционированию,
 * shimmer — polish который не блокирует M2.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  return (
    <View
      style={[
        styles.base,
        { width: width as number, height, borderRadius: borderRadius ?? radius.sm },
        style as ViewStyle,
      ]}
      accessibilityLabel="Загрузка"
    />
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.layer3,
  },
})
