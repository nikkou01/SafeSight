import { StyleSheet, Text } from 'react-native'
import { formatDateTime } from '../utils/datetime'
import { colors, font, spacing } from '../theme'

export default function RefreshLabel({ lastUpdated }) {
  return (
    <Text style={styles.label}>
      Live sync: {lastUpdated ? formatDateTime(lastUpdated) : 'waiting for first update'}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: {
    color: colors.inkMuted,
    fontSize: 12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    fontFamily: font.body,
  },
})
