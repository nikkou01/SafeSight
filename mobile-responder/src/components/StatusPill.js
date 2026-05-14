import { StyleSheet, Text, View } from 'react-native'
import { colors, font, radius } from '../theme'

const statusStyles = {
  pending: { bg: colors.warningSoft, fg: colors.warning, border: '#f5d38b' },
  acknowledged: { bg: colors.infoSoft, fg: colors.info, border: '#bfd7ff' },
  responded: { bg: colors.violetSoft, fg: colors.violet, border: '#d9c9ff' },
  resolved: { bg: colors.successSoft, fg: colors.success, border: '#bfe9cc' },
  sent: { bg: colors.successSoft, fg: colors.success, border: '#bfe9cc' },
  failed: { bg: colors.dangerSoft, fg: colors.danger, border: '#f6b6b6' },
}

export default function StatusPill({ value }) {
  const key = String(value || '').toLowerCase()
  const style = statusStyles[key] || { bg: '#e2e8f0', fg: colors.inkSoft, border: colors.border }

  return (
    <View style={[styles.pill, { backgroundColor: style.bg, borderColor: style.border }]}>
      <Text style={[styles.text, { color: style.fg }]}>{value || 'unknown'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontFamily: font.bodyMedium,
    textTransform: 'capitalize',
  },
})
