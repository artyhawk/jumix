import { colors, font, radius } from '@/theme/tokens'
import { useMemo } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'

interface AvatarProps {
  url: string | null
  initials: string
  size?: number
  /** Для accessibility — full name или другая identifying строка. */
  label?: string
}

/**
 * Avatar с fallback на инициалы. Если `url` задан — <Image>. Иначе — круг
 * brand-500 с текстовыми инициалами (upper-case). Размер параметризован,
 * default 48dp.
 *
 * Brand orange используется как fallback background — exception от «≤5%
 * surface» rule: Avatar появляется в identity card точечно (1 на screen).
 */
export function Avatar({ url, initials, size = 48, label }: AvatarProps) {
  const styles = useMemo(() => createStyles(size), [size])

  if (url) {
    return (
      <Image source={{ uri: url }} style={styles.image} accessibilityLabel={label ?? 'Аватар'} />
    )
  }

  return (
    <View style={styles.placeholder} accessibilityLabel={label ?? 'Аватар'}>
      <Text style={styles.initials}>{initials}</Text>
    </View>
  )
}

function createStyles(size: number) {
  return StyleSheet.create({
    image: {
      width: size,
      height: size,
      borderRadius: radius.full,
      backgroundColor: colors.layer3,
    },
    placeholder: {
      width: size,
      height: size,
      borderRadius: radius.full,
      backgroundColor: colors.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: {
      color: colors.textInverse,
      fontSize: Math.max(12, Math.floor(size * 0.4)),
      fontWeight: font.weight.semibold,
    },
  })
}
