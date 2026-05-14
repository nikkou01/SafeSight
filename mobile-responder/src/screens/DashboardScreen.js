import { useEffect, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fetchAlerts, fetchCollisions, fetchStats } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import StatCard from '../components/StatCard'
import StatusPill from '../components/StatusPill'
import RefreshLabel from '../components/RefreshLabel'
import { formatDateTime } from '../utils/datetime'
import { colors, font, radius, shadows, spacing } from '../theme'

export default function DashboardScreen() {
  const [stats, setStats] = useState(null)
  const [collisions, setCollisions] = useState([])
  const [alerts, setAlerts] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const [statsData, collisionsData, alertsData] = await Promise.all([
        fetchStats(),
        fetchCollisions(),
        fetchAlerts(),
      ])
      setStats(statsData)
      setCollisions(collisionsData)
      setAlerts(alertsData)
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

  const recentCollision = useMemo(() => collisions[0] || null, [collisions])
  const recentAlert = useMemo(() => alerts[0] || null, [alerts])
  const rawCollisionConfidence = recentCollision?.confidence_score
  const collisionConfidence = Number(rawCollisionConfidence)
  const hasCollisionConfidence = rawCollisionConfidence !== null && rawCollisionConfidence !== undefined && Number.isFinite(collisionConfidence)

  return (
    <View style={styles.screen}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        <View style={styles.statRow}>
          <StatCard label="Total Collisions" value={stats?.total_collisions ?? 0} tone={colors.danger} />
          <StatCard label="Pending" value={stats?.pending_collisions ?? 0} tone={colors.warning} />
          <StatCard label="Active Cameras" value={stats?.active_cameras ?? 0} tone={colors.accent} />
          <StatCard label="Total Alerts" value={stats?.total_alerts ?? 0} tone={colors.info} />
        </View>

        <View style={[styles.card, shadows.card]}>
          <Text style={styles.sectionTitle}>Latest Collision</Text>
          {!recentCollision ? (
            <Text style={styles.mutedText}>No collisions yet.</Text>
          ) : (
            <>
              <StatusPill value={recentCollision.status} />
              <Text style={styles.primaryText}>{recentCollision.camera_name}</Text>
              <Text style={styles.secondaryText}>{recentCollision.camera_location}</Text>
              <Text style={styles.confidenceText}>
                {hasCollisionConfidence
                  ? `${(collisionConfidence * 100).toFixed(1)}% confidence`
                  : 'Confidence N/A'}
              </Text>
              <Text style={styles.timestamp}>{formatDateTime(recentCollision.timestamp)}</Text>
            </>
          )}
        </View>

        <View style={[styles.card, shadows.card]}>
          <Text style={styles.sectionTitle}>Latest SMS Alert</Text>
          {!recentAlert ? (
            <Text style={styles.mutedText}>No alerts yet.</Text>
          ) : (
            <>
              <StatusPill value={recentAlert.status} />
              <Text style={styles.messageText}>{recentAlert.message}</Text>
              <Text style={styles.timestamp}>{formatDateTime(recentAlert.sent_at)}</Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: font.display,
    marginBottom: 8,
  },
  mutedText: {
    color: colors.inkMuted,
    fontFamily: font.body,
  },
  primaryText: {
    color: colors.ink,
    fontFamily: font.bodyMedium,
    marginTop: 8,
  },
  secondaryText: {
    color: colors.inkSoft,
    marginTop: 3,
    fontFamily: font.body,
  },
  confidenceText: {
    color: colors.ink,
    marginTop: 6,
    fontFamily: font.bodyMedium,
  },
  timestamp: {
    color: colors.inkMuted,
    marginTop: 4,
    fontSize: 12,
    fontFamily: font.body,
  },
  messageText: {
    color: colors.inkSoft,
    marginTop: 8,
    fontFamily: font.body,
  },
})
