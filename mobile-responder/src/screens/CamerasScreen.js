import { useEffect, useState } from 'react'
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fetchCameras, getSnapshotUrl } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import { useAuth } from '../context/AuthContext'
import RefreshLabel from '../components/RefreshLabel'
import StatusPill from '../components/StatusPill'
import { colors, font, radius, shadows, spacing } from '../theme'

export default function CamerasScreen() {
  const { token } = useAuth()
  const [rows, setRows] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const data = await fetchCameras()
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

  return (
    <View style={styles.screen}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        {rows.map(item => {
          const canShowSnapshot = item.status === 'active' && item.rtsp_url
          return (
            <View key={item.id} style={[styles.card, shadows.card]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <StatusPill value={item.status} />
              </View>
              <Text style={styles.cardSubtitle}>{item.location}</Text>

              {canShowSnapshot ? (
                <Image
                  source={{
                    uri: getSnapshotUrl(item.id),
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  }}
                  style={styles.snapshot}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.snapshotPlaceholder}>
                  <Text style={styles.placeholderText}>No live snapshot for this camera.</Text>
                </View>
              )}
            </View>
          )
        })}

        {rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No cameras available.</Text>
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
  cardSubtitle: {
    color: colors.inkSoft,
    marginBottom: 8,
    fontFamily: font.body,
  },
  snapshot: {
    height: 160,
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: '#0f172a',
  },
  snapshotPlaceholder: {
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  placeholderText: {
    color: colors.inkMuted,
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
