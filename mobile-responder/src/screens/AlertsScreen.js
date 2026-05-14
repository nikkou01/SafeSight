import { useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fetchAlerts } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import RefreshLabel from '../components/RefreshLabel'
import StatusPill from '../components/StatusPill'
import { formatDateTime } from '../utils/datetime'
import { colors, font, radius, shadows, spacing } from '../theme'

export default function AlertsScreen() {
  const [rows, setRows] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const data = await fetchAlerts()
      setRows(data)
      setLastUpdated(new Date().toISOString())
    } finally {
      if (!background) setRefreshing(false)
    }
  }

  useEffect(() => {
    load(false)
    const id = setInterval(() => load(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.status === 'sent') acc.sent += 1
        else acc.failed += 1
        return acc
      },
      { sent: 0, failed: 0 },
    )
  }, [rows])

  return (
    <View style={styles.screen}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <View style={[styles.summaryCard, shadows.card]}>
        <Text style={styles.summaryTitle}>SMS Delivery Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Sent</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{summary.sent}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Failed</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>{summary.failed}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        {rows.map(item => (
          <View key={item.id} style={[styles.card, shadows.card]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.recipient_name || 'Responder'}</Text>
              <StatusPill value={item.status} />
            </View>
            <Text style={styles.cardBody}>{item.message}</Text>
            <Text style={styles.timestamp}>{formatDateTime(item.sent_at)}</Text>
          </View>
        ))}

        {rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No alert logs yet.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  summaryTitle: {
    color: colors.ink,
    fontFamily: font.display,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  summaryLabel: {
    color: colors.inkSoft,
    fontFamily: font.body,
  },
  summaryValue: {
    fontFamily: font.bodyMedium,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.ink,
    fontFamily: font.bodyMedium,
  },
  cardBody: {
    color: colors.inkSoft,
    fontFamily: font.body,
  },
  timestamp: {
    color: colors.inkMuted,
    marginTop: 8,
    fontSize: 12,
    fontFamily: font.body,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.inkMuted,
    fontFamily: font.body,
  },
})
