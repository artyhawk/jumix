import { SafeArea } from '@/components/ui/safe-area'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { Link, Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Не найдено' }} />
      <SafeArea>
        <View style={styles.container}>
          <Text style={typography.heading1}>404</Text>
          <Text style={typography.bodySecondary}>Такой страницы нет.</Text>
          <Link href="/" style={styles.link}>
            <Text style={styles.linkText}>На главную</Text>
          </Link>
        </View>
      </SafeArea>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.layer0,
  },
  link: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  linkText: {
    color: colors.brand500,
    fontSize: 16,
    fontWeight: '600',
  },
})
