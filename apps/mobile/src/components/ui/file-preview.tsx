import { formatFileSize } from '@/lib/format/file-size'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

interface FilePreviewProps {
  uri: string
  mimeType: string
  fileName: string
  size?: number | null
  onRemove?: () => void
}

/**
 * Preview thumbnail selected file перед upload. Image → native thumbnail;
 * PDF → icon + filename (полноценный PDF render requires react-native-pdf,
 * backlog).
 */
export function FilePreview({ uri, mimeType, fileName, size, onRemove }: FilePreviewProps) {
  const isImage = mimeType.startsWith('image/')
  const sizeLabel = typeof size === 'number' ? formatFileSize(size) : null

  return (
    <View style={styles.container}>
      <View style={styles.thumb}>
        {isImage ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel="Превью файла"
          />
        ) : (
          <View style={styles.pdfPlaceholder}>
            <Text style={styles.pdfGlyph}>PDF</Text>
          </View>
        )}
      </View>

      <View style={styles.meta}>
        <Text style={typography.body} numberOfLines={2}>
          {fileName}
        </Text>
        {sizeLabel ? <Text style={[typography.caption, styles.size]}>{sizeLabel}</Text> : null}
      </View>

      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Удалить файл"
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Text style={styles.removeGlyph}>×</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer2,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.layer3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer3,
  },
  pdfGlyph: {
    color: colors.textSecondary,
    fontSize: font.size.base,
    fontWeight: font.weight.bold,
    letterSpacing: 1,
  },
  meta: {
    flex: 1,
    gap: spacing.xs,
  },
  size: {
    color: colors.textTertiary,
  },
  remove: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer3,
  },
  removeGlyph: {
    color: colors.textPrimary,
    fontSize: font.size.lg,
    lineHeight: font.size.lg,
    marginTop: -2,
  },
})
