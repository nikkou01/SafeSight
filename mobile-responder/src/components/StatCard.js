import { StyleSheet, Text, View } from 'react-native'
import { colors, font, radius, shadows, spacing } from '../theme'

export default function StatCard({ label, value, tone = '#0f172a' }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: tone }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.inkMuted,
    fontSize: 12,
    marginBottom: 6,
    fontFamily: font.bodyMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: {
    fontSize: 26,
    fontFamily: font.display,
  },
})
