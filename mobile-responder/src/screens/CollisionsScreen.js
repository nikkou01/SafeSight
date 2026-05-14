import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { fetchCollisions, getCollisionClipUrl, updateCollisionSeverity, updateCollisionStatus } from '../api/client'
import { REFRESH_INTERVAL_MS } from '../config'
import RefreshLabel from '../components/RefreshLabel'
import StatusPill from '../components/StatusPill'
import { formatDateTime } from '../utils/datetime'
import { colors, font, radius, shadows, spacing } from '../theme'

const tabs = ['all', 'pending', 'acknowledged', 'responded', 'resolved']

export default function CollisionsScreen() {
  const [rows, setRows] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [filter, setFilter] = useState('all')
  const [busyId, setBusyId] = useState('')
  const [severityBusyId, setSeverityBusyId] = useState('')
  const [reviewedIds, setReviewedIds] = useState([])

  async function load(background = false) {
    if (!background) setRefreshing(true)
    try {
      const data = await fetchCollisions()
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

  async function setStatus(id, status) {
    try {
      setBusyId(id)
      await updateCollisionStatus(id, status)
      await load(true)
    } catch {
      Alert.alert('Update failed', 'Could not update collision status.')
    } finally {
      setBusyId('')
    }
  }

  async function openClip(item) {
    if (String(item?.video_status || '').toLowerCase() === 'processing') {
      Alert.alert('Clip still processing', 'The 15-second detection clip is still being generated.')
      return
    }

    const clipUrl = getCollisionClipUrl(item)
    if (!clipUrl) {
      Alert.alert('No clip available', 'No 15-second clip is available for this collision yet.')
      return
    }

    try {
      const supported = await Linking.canOpenURL(clipUrl)
      if (!supported) {
        Alert.alert('Open failed', 'This device could not open the collision clip link.')
        return
      }
      await Linking.openURL(clipUrl)
      setReviewedIds(prev => (prev.includes(item.id) ? prev : [...prev, item.id]))
    } catch {
      Alert.alert('Open failed', 'Could not open the collision clip. Please try again.')
    }
  }

  async function setSeverity(id, level) {
    try {
      setSeverityBusyId(id)
      await updateCollisionSeverity(id, level)
      await load(true)
    } catch {
      Alert.alert('Update failed', 'Could not update collision severity.')
    } finally {
      setSeverityBusyId('')
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(item => item.status === filter)
  }, [rows, filter])

  function getConfidenceTone(confidence) {
    if (!Number.isFinite(confidence)) return { bg: colors.surfaceAlt, fg: colors.inkMuted, border: colors.border }
    if (confidence >= 0.8) return { bg: colors.successSoft, fg: colors.success, border: '#bfe9cc' }
    if (confidence >= 0.6) return { bg: colors.warningSoft, fg: colors.warning, border: '#f5d38b' }
    return { bg: colors.dangerSoft, fg: colors.danger, border: '#f6b6b6' }
  }

  return (
    <View style={styles.screen}>
      <RefreshLabel lastUpdated={lastUpdated} />
      <View style={styles.filterRow}>
        {tabs.map(tab => {
          const isActive = filter === tab
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.filterPill, isActive ? styles.filterPillActive : styles.filterPillInactive]}
            >
              <Text style={[styles.filterText, isActive ? styles.filterTextActive : styles.filterTextInactive]}>{tab}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        {filtered.map(item => (
          <View key={item.id} style={[styles.card, shadows.card]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.camera_name}</Text>
              <StatusPill value={item.status} />
            </View>
            <Text style={styles.cardSubtitle}>{item.camera_location}</Text>

            <View style={styles.severityRow}>
              <Text style={styles.severityLabel}>Severity</Text>
              <Text style={styles.severityValue}>{String(item.severity || 'unreviewed')}</Text>
            </View>

            {(() => {
              const rawConfidence = item.confidence_score
              const confidence = Number(rawConfidence)
              const hasConfidence = rawConfidence !== null && rawConfidence !== undefined && Number.isFinite(confidence)
              const confidenceTone = getConfidenceTone(hasConfidence ? confidence : Number.NaN)
              return (
                <View style={[styles.confidencePill, { backgroundColor: confidenceTone.bg, borderColor: confidenceTone.border }]}>
                  <Text style={[styles.confidenceText, { color: confidenceTone.fg }]}>
                    Confidence {hasConfidence ? `${(confidence * 100).toFixed(1)}%` : 'N/A'}
                  </Text>
                </View>
              )
            })()}

            <Text style={styles.timestamp}>{formatDateTime(item.timestamp)}</Text>

            {item.video_status === 'processing' ? (
              <Text style={[styles.noteText, { color: colors.warning }]}>Clip status: processing 15-second evidence...</Text>
            ) : null}
            {item.video_status === 'failed' ? (
              <Text style={[styles.noteText, { color: colors.danger }]}>
                Clip status: failed {item.video_error ? `(${item.video_error})` : ''}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <ActionButton
                disabled={String(item?.video_status || '').toLowerCase() === 'processing'}
                label={String(item?.video_status || '').toLowerCase() === 'processing' ? 'Clip Processing...' : 'View 15s Clip'}
                tone={colors.info}
                onPress={() => openClip(item)}
              />

              {reviewedIds.includes(item.id) ? (
                <View style={styles.severityPicker}>
                  {['low', 'medium', 'high'].map(level => {
                    const isActive = String(item.severity || '') === level
                    const isBusy = severityBusyId === item.id
                    return (
                      <TouchableOpacity
                        key={level}
                        onPress={() => setSeverity(item.id, level)}
                        disabled={isBusy}
                        style={[
                          styles.severityChip,
                          isActive ? styles.severityChipActive : styles.severityChipInactive,
                          isBusy && styles.actionButtonDisabled,
                        ]}
                      >
                        <Text style={[styles.severityChipText, isActive ? styles.severityChipTextActive : styles.severityChipTextInactive]}>
                          {level}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ) : (
                <Text style={styles.reviewHint}>Review clip to set severity.</Text>
              )}

              {item.status === 'pending' ? (
                <>
                  <ActionButton
                    disabled={busyId === item.id}
                    busyText="Updating..."
                    label="Acknowledge"
                    tone={colors.success}
                    onPress={() => setStatus(item.id, 'acknowledged')}
                  />
                  <ActionButton
                    disabled={busyId === item.id}
                    busyText="Updating..."
                    label="Decline"
                    tone={colors.danger}
                    onPress={() => setStatus(item.id, 'resolved')}
                  />
                </>
              ) : null}

              {item.status === 'acknowledged' ? (
                <ActionButton
                  disabled={busyId === item.id}
                  busyText="Updating..."
                  label="Mark Responded"
                  tone={colors.violet}
                  onPress={() => setStatus(item.id, 'responded')}
                />
              ) : null}

              {item.status === 'responded' ? (
                <ActionButton
                  disabled={busyId === item.id}
                  busyText="Updating..."
                  label="Mark Resolved"
                  tone={colors.success}
                  onPress={() => setStatus(item.id, 'resolved')}
                />
              ) : null}
            </View>
          </View>
        ))}

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No collisions in this filter.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function ActionButton({ label, onPress, tone, disabled, busyText }) {
  const displayText = disabled && busyText ? busyText : label
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, { backgroundColor: tone }, disabled && styles.actionButtonDisabled]}
    >
      <Text style={styles.actionButtonText}>{displayText}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterPillInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  filterText: {
    fontFamily: font.bodyMedium,
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: 'white',
  },
  filterTextInactive: {
    color: colors.inkSoft,
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
  },
  cardTitle: {
    fontFamily: font.bodyMedium,
    color: colors.ink,
    flex: 1,
    marginRight: 8,
  },
  cardSubtitle: {
    color: colors.inkSoft,
    marginTop: 4,
    fontFamily: font.body,
  },
  severityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 6,
  },
  severityLabel: {
    color: colors.inkMuted,
    fontFamily: font.body,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  severityValue: {
    color: colors.ink,
    fontFamily: font.bodyMedium,
    textTransform: 'capitalize',
    fontSize: 12,
  },
  confidencePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confidenceText: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
  },
  timestamp: {
    color: colors.inkMuted,
    marginTop: 6,
    fontSize: 12,
    fontFamily: font.body,
  },
  noteText: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: font.body,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  severityPicker: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  severityChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  severityChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  severityChipInactive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  severityChipText: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  severityChipTextActive: {
    color: 'white',
  },
  severityChipTextInactive: {
    color: colors.inkSoft,
  },
  reviewHint: {
    color: colors.inkMuted,
    fontFamily: font.body,
    fontSize: 12,
  },
  actionButton: {
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    opacity: 1,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: 'white',
    fontFamily: font.bodyMedium,
    fontSize: 12,
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
