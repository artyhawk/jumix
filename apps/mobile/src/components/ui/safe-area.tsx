import { colors } from '@/theme/tokens'
import type { ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Edge = 'top' | 'bottom' | 'left' | 'right'

interface SafeAreaProps {
  children: ReactNode
  edges?: Edge[]
  /** Фон — обычно layer0 (корневой); layer1 в тех местах, где контент
   *  лежит ниже header'а другого цвета. */
  backgroundColor?: string
  style?: ViewStyle
}

/**
 * Обёртка над `react-native-safe-area-context` — применяет padding только
 * для указанных edges. По default: top + bottom (полноэкранный контент).
 */
export function SafeArea({
  children,
  edges = ['top', 'bottom'],
  backgroundColor = colors.layer0,
  style,
}: SafeAreaProps) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.container,
        { backgroundColor },
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
          paddingLeft: edges.includes('left') ? insets.left : 0,
          paddingRight: edges.includes('right') ? insets.right : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
