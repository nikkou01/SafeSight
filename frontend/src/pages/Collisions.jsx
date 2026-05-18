import { useEffect, useMemo, useState } from 'react'
import { fetchCollisions, acknowledgeCollision, updateCollisionStatus, updateCollisionSeverity, updateCollisionType, fetchCollisionVideoBlob } from '../api'
import { formatApiDateTime } from '../utils/datetime'
import useAutoRefresh from '../utils/useAutoRefresh'

const COLLISION_TYPE_OPTIONS = [
  { value: 'single_vehicle', label: 'Single-Vehicle' },
  { value: 'rear_end', label: 'Rear-End' },
  { value: 'head_on', label: 'Head-On' },
  { value: 'side_impact', label: 'Side-Impact' },
]

const COLLISION_TYPE_LABELS = {
  single_vehicle: 'Single-Vehicle',
  rear_end: 'Rear-End',
  head_on: 'Head-On',
  side_impact: 'Side-Impact',
  multi_vehicle: 'Multi-Vehicle',
}

const PAGE_SIZE = 10
const REVIEWED_STORAGE_KEY = 'safesight.reviewedCollisionIds'

function normalizeCollisionType(value) {
  const rawValue = String(value || '').trim().toLowerCase()
  if (!rawValue) return ''

  if (['single-vehicle', 'single vehicle', 'single_vehicle'].includes(rawValue)) return 'single_vehicle'
  if (['rear-end', 'rear end', 'rear_end'].includes(rawValue)) return 'rear_end'
  if (['head-on', 'head on', 'head_on'].includes(rawValue)) return 'head_on'
  if (['side-impact', 'side impact', 'side_impact'].includes(rawValue)) return 'side_impact'
  if (['multi-vehicle', 'multi vehicle', 'multi_vehicle'].includes(rawValue)) return 'multi_vehicle'

  return ''
}

function formatCollisionTypeLabel(value) {
  const normalized = normalizeCollisionType(value)
  if (!normalized) return 'unreviewed'
  return COLLISION_TYPE_LABELS[normalized] || 'unreviewed'
}

function isReviewedLog(collision) {
  const severity = String(collision?.severity || '').toLowerCase()
  const hasSeverity = ['low', 'medium', 'high'].includes(severity)
  const hasType = !!normalizeCollisionType(collision?.collision_type)
  return hasSeverity || hasType
}

function hasRequiredActionFields(collision) {
  const severity = String(collision?.severity || '').toLowerCase()
  const hasSeverity = ['low', 'medium', 'high'].includes(severity)
  const hasType = !!normalizeCollisionType(collision?.collision_type)
  return hasSeverity && hasType
}

export default function Collisions({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('pending')
  const [loadingVideoId, setLoadingVideoId] = useState('')
  const [statusActionId, setStatusActionId] = useState('')
  const [severitySaving, setSeveritySaving] = useState(false)
  const [typeSaving, setTypeSaving] = useState(false)
  const [reviewedCollisionIds, setReviewedCollisionIds] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = window.sessionStorage.getItem(REVIEWED_STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [page, setPage] = useState(1)
  const [viewer, setViewer] = useState({ open: false, url: '', collision: null })
  const [viewerPlaybackSecond, setViewerPlaybackSecond] = useState(0)

  async function load(options = {}) {
    const background = !!options.background
    if (!background) setLoading(true)
    try {
      setCollisions(await fetchCollisions())
    } catch {
      if (!background) notify('Failed to load collisions.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 5000 })

  useEffect(() => {
    return () => {
      if (viewer.url) URL.revokeObjectURL(viewer.url)
    }
  }, [viewer.url])

  useEffect(() => {
    setPage(1)
  }, [filter])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!reviewedCollisionIds.length) {
      window.sessionStorage.removeItem(REVIEWED_STORAGE_KEY)
      return
    }
    window.sessionStorage.setItem(REVIEWED_STORAGE_KEY, JSON.stringify(reviewedCollisionIds))
  }, [reviewedCollisionIds])

  function isCollisionReviewed(collision) {
    if (!collision) return false
    if (reviewedCollisionIds.includes(collision.id)) return true
    return isReviewedLog(collision)
  }

  async function handleAck(id) {
    try {
      setStatusActionId(id)
      await acknowledgeCollision(id)
      notify('✅ Collision acknowledged.', 'success')
      await load({ background: true })
    } catch {
      notify('Failed to acknowledge collision.', 'error')
    } finally {
      setStatusActionId('')
    }
  }

  async function handleStatusUpdate(id, nextStatus, successMessage) {
    try {
      setStatusActionId(id)
      await updateCollisionStatus(id, nextStatus)
      notify(successMessage, 'success')
      await load({ background: true })
    } catch {
      notify('Failed to update collision status.', 'error')
    } finally {
      setStatusActionId('')
    }
  }

  async function handleSeverityUpdate(level) {
    const collisionId = viewer?.collision?.id
    if (!collisionId || !isCollisionReviewed(viewer?.collision)) {
      notify('Review the clip before setting severity.', 'warning')
      return
    }
    if (!collisionId || severitySaving) return
    setSeveritySaving(true)
    try {
      await updateCollisionSeverity(collisionId, level)
      setViewer(prev => {
        if (!prev.collision) return prev
        return { ...prev, collision: { ...prev.collision, severity: level } }
      })
      await load({ background: true })
      notify(`Severity set to ${level}.`, 'success')
    } catch {
      notify('Failed to update severity.', 'error')
    } finally {
      setSeveritySaving(false)
    }
  }

  async function handleCollisionTypeUpdate(nextType) {
    const collisionId = viewer?.collision?.id
    if (!collisionId || !isCollisionReviewed(viewer?.collision)) {
      notify('Review the clip before setting collision type.', 'warning')
      return
    }
    if (!collisionId || typeSaving) return
    setTypeSaving(true)
    try {
      await updateCollisionType(collisionId, nextType)
      setViewer(prev => {
        if (!prev.collision) return prev
        return { ...prev, collision: { ...prev.collision, collision_type: nextType } }
      })
      await load({ background: true })
      notify(`Collision type set to ${formatCollisionTypeLabel(nextType)}.`, 'success')
    } catch {
      notify('Failed to update collision type.', 'error')
    } finally {
      setTypeSaving(false)
    }
  }

  async function handlePlayVideo(collision) {
    if (!collision?.video_file_id) {
      notify('No collision clip available yet.', 'warning')
      return
    }

    setLoadingVideoId(collision.id)
    setReviewedCollisionIds(prev => (prev.includes(collision.id) ? prev : [...prev, collision.id]))
    setViewerPlaybackSecond(0)
    try {
      const blob = await fetchCollisionVideoBlob(collision.id)
      const url = URL.createObjectURL(blob)
      setViewer(prev => {
        if (prev.url) URL.revokeObjectURL(prev.url)
        return { open: true, url, collision }
      })
    } catch (err) {
      let detail = 'Failed to load collision clip.'
      const payload = err?.response?.data
      if (payload instanceof Blob) {
        try {
          const text = await payload.text()
          const parsed = JSON.parse(text)
          detail = parsed?.detail || detail
        } catch {
          detail = detail
        }
      } else if (err?.response?.data?.detail) {
        detail = err.response.data.detail
      }
      notify(detail, 'error')
    } finally {
      setLoadingVideoId('')
    }
  }

  function closeViewer() {
    setViewerPlaybackSecond(0)
    setViewer(prev => {
      if (prev.url) URL.revokeObjectURL(prev.url)
      return { open: false, url: '', collision: null }
    })
  }


  const filtered = useMemo(
    () => (filter === 'all' ? collisions : collisions.filter(c => c.status === filter)),
    [collisions, filter],
  )

  const unreviewedCount = useMemo(() => {
    const reviewedIds = new Set(reviewedCollisionIds)
    return collisions.filter(c => !(reviewedIds.has(c.id) || isReviewedLog(c))).length
  }, [collisions, reviewedCollisionIds])

  const statusCounts = useMemo(() => {
    const base = { all: 0, pending: 0, acknowledged: 0, responded: 0, resolved: 0 }
    return collisions.reduce((acc, collision) => {
      const status = String(collision?.status || '').toLowerCase()
      acc.all += 1
      if (acc[status] !== undefined) acc[status] += 1
      return acc
    }, base)
  }, [collisions])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    [filtered.length],
  )

  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  const mostRecentId = useMemo(() => {
    if (!filtered.length) return ''
    let latest = filtered[0]
    let latestTs = Number(new Date(filtered[0].timestamp)) || 0
    for (let i = 1; i < filtered.length; i += 1) {
      const next = filtered[i]
      const nextTs = Number(new Date(next.timestamp)) || 0
      if (nextTs > latestTs) {
        latest = next
        latestTs = nextTs
      }
    }
    return latest?.id || ''
  }, [filtered])

  const viewerOverlayData = useMemo(() => {
    const collision = viewer?.collision
    const rawBoxes = Array.isArray(collision?.detection_boxes)
      ? collision.detection_boxes
      : (Array.isArray(collision?.boxes) ? collision.boxes : [])

    const frameWidth = Number(collision?.detection_frame_width || 0)
    const frameHeight = Number(collision?.detection_frame_height || 0)
    const collisionSecondRaw = Number(collision?.video_collision_at_second)
    const collisionSecond = Number.isFinite(collisionSecondRaw) ? collisionSecondRaw : null

    if (!rawBoxes.length || frameWidth <= 0 || frameHeight <= 0 || collisionSecond === null) {
      return {
        available: false,
        show: false,
        boxes: [],
        collisionSecond: null,
      }
    }

    const toleranceSeconds = 0.4
    const show = Math.abs(viewerPlaybackSecond - collisionSecond) <= toleranceSeconds

    const boxes = rawBoxes
      .map((box, index) => {
        const coords = Array.isArray(box?.coords) ? box.coords : []
        if (coords.length !== 4) return null

        const x1 = Number(coords[0])
        const y1 = Number(coords[1])
        const x2 = Number(coords[2])
        const y2 = Number(coords[3])
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null
        if (x2 <= x1 || y2 <= y1) return null

        const left = Math.max(0, Math.min(100, (x1 / frameWidth) * 100))
        const top = Math.max(0, Math.min(100, (y1 / frameHeight) * 100))
        const width = Math.max(0, Math.min(100 - left, ((x2 - x1) / frameWidth) * 100))
        const height = Math.max(0, Math.min(100 - top, ((y2 - y1) / frameHeight) * 100))

        if (width <= 0 || height <= 0) return null

        const className = String(box?.class_name || 'object')
        const confidence = Number(box?.confidence)
        const confidenceText = Number.isFinite(confidence) ? ` ${(confidence * 100).toFixed(0)}%` : ''
        const trackText = Number.isFinite(Number(box?.track_id)) ? ` #T${Number(box.track_id)}` : ''

        return {
          key: `${className}-${index}`,
          left,
          top,
          width,
          height,
          label: `${className}${confidenceText}${trackText}`,
        }
      })
      .filter(Boolean)

    return {
      available: boxes.length > 0,
      show: show && boxes.length > 0,
      boxes,
      collisionSecond,
    }
  }, [viewer, viewerPlaybackSecond])

  const statusColor = {
    pending:      'bg-orange-100 text-orange-800',
    acknowledged: 'bg-green-100 text-green-800',
    responded:    'bg-green-100 text-green-800',
    resolved:     'bg-green-100 text-green-800',
  }
  const clipStatusColor = {
    ready: 'bg-green-100 text-green-800',
    processing: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    missing: 'bg-gray-100 text-gray-600',
  }
  const smsStatusColor = {
    sent: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  }

  function getSmsStatus(collision) {
    const status = String(collision?.sms_status || '').toLowerCase()
    if (['sent', 'failed', 'pending'].includes(status)) return status

    const total = Number(collision?.sms_total_recipients)
    const sent = Number(collision?.sms_sent)
    const failed = Number(collision?.sms_failed)

    if (!Number.isFinite(total) || total <= 0) return 'pending'
    if (failed > 0) return 'failed'
    if (sent >= total) return 'sent'
    return 'pending'
  }

  function getSmsTooltip(collision) {
    const total = Number(collision?.sms_total_recipients)
    const sent = Number(collision?.sms_sent)
    const failed = Number(collision?.sms_failed)

    if (!Number.isFinite(total) || total <= 0) return 'No SMS recipients'
    const sentText = Number.isFinite(sent) ? sent : 0
    const failedText = Number.isFinite(failed) ? failed : 0
    return `Sent: ${sentText} | Failed: ${failedText} | Total: ${total}`
  }

  function renderStatusAudit(collision) {
    const status = String(collision?.status || '').toLowerCase()

    if (status === 'acknowledged' && collision?.acknowledged_by) {
      const at = collision?.acknowledged_at ? formatApiDateTime(collision.acknowledged_at) : 'N/A'
      return `Acknowledged by ${collision.acknowledged_by} at ${at}`
    }

    if (status === 'responded' && (collision?.responded_by || collision?.acknowledged_by)) {
      const actor = collision?.responded_by || collision?.acknowledged_by
      const atValue = collision?.responded_at || collision?.acknowledged_at
      const at = atValue ? formatApiDateTime(atValue) : 'N/A'
      return `Responded by ${actor} at ${at}`
    }

    if (status === 'resolved' && (collision?.resolved_by || collision?.responded_by || collision?.acknowledged_by)) {
      const actor = collision?.resolved_by || collision?.responded_by || collision?.acknowledged_by
      const atValue = collision?.resolved_at || collision?.responded_at || collision?.acknowledged_at
      const at = atValue ? formatApiDateTime(atValue) : 'N/A'
      return `Resolved by ${actor} at ${at}`
    }

    return ''
  }

  function getConfidenceBadge(confidenceRaw) {
    const value = Number(confidenceRaw)
    if (!Number.isFinite(value)) {
      return { label: 'N/A', className: 'text-gray-400' }
    }

    const percent = Math.round(value * 100)
    let className = 'bg-red-100 text-red-800 border-red-200'
    if (value < 0.75) {
      className = 'bg-amber-50 text-amber-800 border-amber-200'
    } else if (value < 0.8) {
      className = 'bg-orange-100 text-orange-800 border-orange-200'
    }

    return {
      label: `${percent}%`,
      className: `inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`,
    }
  }

  function renderConfidenceBadge(confidenceRaw) {
    const confidenceBadge = getConfidenceBadge(confidenceRaw)
    return <span className={confidenceBadge.className}>{confidenceBadge.label}</span>
  }

  function renderSeverityBadge(severityRaw) {
    const rawValue = String(severityRaw || '').toLowerCase()
    const value = ['low', 'medium', 'high'].includes(rawValue) ? rawValue : 'unreviewed'
    let className = 'bg-gray-100 text-gray-500 border-gray-200'
    if (value === 'low') className = 'bg-amber-50 text-amber-800 border-amber-200'
    if (value === 'medium') className = 'bg-orange-100 text-orange-800 border-orange-200'
    if (value === 'high') className = 'bg-red-100 text-red-800 border-red-200'

    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
        {value}
      </span>
    )
  }

  function renderCollisionTypeBadge(typeRaw) {
    const normalized = normalizeCollisionType(typeRaw)
    const label = formatCollisionTypeLabel(typeRaw)
    const className = normalized
      ? 'bg-red-100 text-red-800 border-red-200'
      : 'bg-gray-100 text-gray-500 border-gray-200'

    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
        {label}
      </span>
    )
  }

  function getSeverityButtonClass(level, active) {
    const base = 'px-3 py-1.5 rounded-full text-xs font-semibold border transition'
    const palette = {
      low: {
        active: 'bg-amber-500 border-amber-500 text-white',
        inactive: 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50',
      },
      medium: {
        active: 'bg-orange-500 border-orange-500 text-white',
        inactive: 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50',
      },
      high: {
        active: 'bg-red-600 border-red-600 text-white',
        inactive: 'bg-white text-red-700 border-red-200 hover:bg-red-50',
      },
    }
    const tone = palette[level] || palette.low
    return `${base} ${active ? tone.active : tone.inactive}`
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function formatConfidenceLabel(collision) {
    const confidenceRaw = collision.confidence_score ?? collision.confidence
    const confidenceValue = Number(confidenceRaw)
    return Number.isFinite(confidenceValue) ? `${(confidenceValue * 100).toFixed(1)}%` : 'N/A'
  }

  function printCollisionLogs() {
    const rows = filtered
    if (!rows.length) {
      notify('No collision logs to print.', 'warning')
      return
    }

    const exportFilter = filter === 'all' ? 'All' : filter
    const generatedAt = formatApiDateTime(new Date().toISOString())
    const reviewedCount = rows.filter(isCollisionReviewed).length
    const unreviewedCount = rows.length - reviewedCount
    const statusSummary = rows.reduce((acc, collision) => {
      const status = String(collision?.status || '').toLowerCase()
      if (acc[status] !== undefined) acc[status] += 1
      return acc
    }, { pending: 0, acknowledged: 0, responded: 0, resolved: 0 })
    const acknowledgedTotal = statusSummary.acknowledged + statusSummary.responded + statusSummary.resolved
    const respondedTotal = statusSummary.responded + statusSummary.resolved
    const locationCounts = rows.reduce((acc, collision) => {
      const location = String(collision?.camera_location || 'Unknown').trim() || 'Unknown'
      acc[location] = (acc[location] || 0) + 1
      return acc
    }, {})
    const severityCounts = rows.reduce((acc, collision) => {
      const rawValue = String(collision?.severity || '').toLowerCase()
      const key = ['low', 'medium', 'high'].includes(rawValue) ? rawValue : 'unreviewed'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const typeCounts = rows.reduce((acc, collision) => {
      const key = formatCollisionTypeLabel(collision?.collision_type)
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const topLocationEntry = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])[0] || ['N/A', 0]
    const [topLocation, topLocationCount] = topLocationEntry

    function toSortedListItems(counts) {
      const entries = Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      if (!entries.length) {
        return '<li class="list-empty">None</li>'
      }
      return entries.map(([label, count]) => (
        `<li><span class="list-label">${escapeHtml(label)}</span><span class="list-value">${count}</span></li>`
      )).join('')
    }

    const severityList = toSortedListItems(severityCounts)
    const typeList = toSortedListItems(typeCounts)
    const locationList = toSortedListItems(locationCounts)

    const rowHtml = rows.map(collision => {
      const statusValue = String(collision?.status || '').toLowerCase()
      const acknowledged = ['acknowledged', 'responded', 'resolved'].includes(statusValue)
        || Boolean(collision?.acknowledged_at || collision?.acknowledged_by)
      const responded = ['responded', 'resolved'].includes(statusValue)
        || Boolean(collision?.responded_at || collision?.responded_by)
      const reviewedLabel = isCollisionReviewed(collision) ? 'Reviewed' : 'Unreviewed'
      const auditText = renderStatusAudit(collision) || '—'

      return `
        <tr>
          <td>${escapeHtml(collision.id)}</td>
          <td>${escapeHtml(collision.camera_name || 'N/A')}</td>
          <td>${escapeHtml(collision.camera_location || 'N/A')}</td>
          <td>${escapeHtml(formatApiDateTime(collision.timestamp))}</td>
          <td>${escapeHtml(formatConfidenceLabel(collision))}</td>
          <td>${escapeHtml(collision.severity || 'unreviewed')}</td>
          <td>${escapeHtml(formatCollisionTypeLabel(collision.collision_type))}</td>
          <td>${escapeHtml(collision.status || 'unknown')}</td>
          <td>${escapeHtml(acknowledged ? 'Yes' : 'No')}</td>
          <td>${escapeHtml(responded ? 'Yes' : 'No')}</td>
          <td>${escapeHtml(reviewedLabel)}</td>
          <td>${escapeHtml(auditText)}</td>
        </tr>
      `
    }).join('')

    const documentTitle = `Collision Logs - ${exportFilter}`
    const html = `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(documentTitle)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 24px; font-family: Arial, sans-serif; color: #111827; }
            h1 { margin: 0; font-size: 20px; }
            .meta { margin-top: 6px; font-size: 12px; color: #6b7280; }
            .summary { margin-top: 16px; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
            .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #fafafa; }
            .summary-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
            .summary-value { font-size: 14px; font-weight: 700; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; table-layout: fixed; }
            th, td { border: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; font-size: 11px; }
            th { background: #f9fafb; text-align: left; }
            td { word-break: break-word; }
            .totals { margin-top: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
            .totals-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; background: #ffffff; }
            .totals-title { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: #111827; }
            .totals-list { list-style: none; padding: 0; margin: 0; }
            .totals-list li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px dashed #e5e7eb; font-size: 11px; }
            .totals-list li:last-child { border-bottom: none; }
            .list-label { color: #374151; }
            .list-value { color: #111827; font-weight: 600; }
            .list-empty { color: #6b7280; font-style: italic; }
            @media print { body { margin: 10mm; } }
          </style>
        </head>
        <body>
          <h1>Collision Logs Report</h1>
          <div class="meta">Filter: ${escapeHtml(exportFilter)} | Generated: ${escapeHtml(generatedAt)} | Total records: ${rows.length}</div>

          <div class="summary">
            <div class="summary-card">
              <div class="summary-label">Reviewed</div>
              <div class="summary-value">${reviewedCount}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Unreviewed</div>
              <div class="summary-value">${unreviewedCount}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Pending</div>
              <div class="summary-value">${statusSummary.pending}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Acknowledged (incl. resolved)</div>
              <div class="summary-value">${acknowledgedTotal}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Responded (incl. resolved)</div>
              <div class="summary-value">${respondedTotal}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Resolved</div>
              <div class="summary-value">${statusSummary.resolved}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Top hotspot location</div>
              <div class="summary-value">${escapeHtml(topLocation)} (${topLocationCount})</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Camera</th>
                <th>Location</th>
                <th>Timestamp</th>
                <th>Confidence</th>
                <th>Severity</th>
                <th>Type</th>
                <th>Status</th>
                <th>Acknowledged</th>
                <th>Responded</th>
                <th>Reviewed</th>
                <th>Audit</th>
              </tr>
            </thead>
            <tbody>
              ${rowHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-card">
              <div class="totals-title">Severity totals</div>
              <ul class="totals-list">
                ${severityList}
              </ul>
            </div>
            <div class="totals-card">
              <div class="totals-title">Collision type totals</div>
              <ul class="totals-list">
                ${typeList}
              </ul>
            </div>
            <div class="totals-card">
              <div class="totals-title">Top locations</div>
              <ul class="totals-list">
                ${locationList}
              </ul>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>`

    if (typeof window !== 'undefined' && window.safesight?.openPrintReport) {
      window.safesight.openPrintReport(html)
      return
    }

    const printWindow = window.open('about:blank', '_blank')
    if (!printWindow) {
      notify('Pop-up blocked. Allow pop-ups to print the report.', 'warning')
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-160px)]">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-gray-900">Collision Detection Logs</h3>
          {unreviewedCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold px-2.5 py-1 border border-rose-200">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-600 text-white text-[10px]">
                {unreviewedCount}
              </span>
              Unreviewed
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          {['all', 'pending', 'acknowledged', 'responded', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <span className="inline-flex items-center gap-2">
                {f}
                {f === 'pending' && unreviewedCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                    {unreviewedCount}
                  </span>
                )}
                {f !== 'pending' && ['acknowledged', 'responded'].includes(f) && statusCounts[f] > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold">
                    {statusCounts[f]}
                  </span>
                )}
              </span>
            </button>
          ))}
          <button
            onClick={printCollisionLogs}
            disabled={loading || filtered.length === 0}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs disabled:opacity-60"
            title="Print detailed report"
          >
            <i className="fas fa-print" />
          </button>
          <button onClick={() => load()} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs">
            <i className="fas fa-sync-alt" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex justify-center items-center">
            <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <i className="fas fa-check-circle text-4xl mb-3 block text-green-300" />
            No {filter !== 'all' ? filter : ''} collision events.
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {['Camera', 'Location', 'Time', 'Severity', 'Type', 'Status', 'SMS', 'Clip', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paged.map(c => (
                  (() => {
                    const reviewed = isCollisionReviewed(c)
                    const isMostRecent = c.id === mostRecentId
                    const showMostRecent = isMostRecent && !reviewed && c.status === 'pending'
                    const leftBarClass = reviewed
                      ? 'border-l-4 border-transparent'
                      : 'border-l-4 border-red-500'
                    const baseBg = reviewed ? 'bg-white' : 'bg-red-50/40'
                    const highlightBg = showMostRecent ? 'bg-rose-50/60' : ''
                    const primaryText = reviewed ? 'text-gray-900' : 'text-gray-400'
                    const secondaryText = reviewed ? 'text-gray-500' : 'text-gray-400'
                    return (
                      <tr
                        key={c.id}
                        className={`transition-colors ${baseBg} ${highlightBg} hover:bg-gray-50`}
                      >
                    <td className={`px-4 py-3 text-sm font-medium ${primaryText} ${leftBarClass}`}>
                      <div className="flex items-center gap-2">
                        <span>{c.camera_name}</span>
                        {!reviewed && (
                          <span className="inline-flex items-center rounded-full bg-rose-50 text-rose-700 text-[10px] font-semibold px-2 py-0.5 border border-rose-200">
                            Unreviewed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${secondaryText}`}>{c.camera_location}</td>
                    <td className={`px-4 py-3 text-sm whitespace-nowrap ${secondaryText}`}>
                      {formatApiDateTime(c.timestamp)}
                    </td>
                    <td className={`px-4 py-3 text-sm whitespace-nowrap ${secondaryText}`}>
                      {renderSeverityBadge(c.severity)}
                    </td>
                    <td className={`px-4 py-3 text-sm whitespace-nowrap ${secondaryText}`}>
                      {renderCollisionTypeBadge(c.collision_type)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const smsStatus = getSmsStatus(c)
                        return (
                          <span
                            title={getSmsTooltip(c)}
                            className={`px-2 py-1 text-xs rounded-full font-medium ${smsStatusColor[smsStatus] || smsStatusColor.pending}`}
                          >
                            {smsStatus}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {c.video_file_id ? (
                        <div className="space-y-1">
                          <button
                            onClick={() => handlePlayVideo(c)}
                            disabled={loadingVideoId === c.id}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-full disabled:opacity-60"
                          >
                            {loadingVideoId === c.id ? 'Loading clip...' : 'Play 15s Clip'}
                          </button>
                          <div className="text-xs text-gray-500">
                            {c.video_pre_event_seconds || 0}s before + {c.video_post_event_seconds || 0}s after
                          </div>
                          {c.video_public_url && (
                            <a
                              href={c.video_public_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setReviewedCollisionIds(prev => (prev.includes(c.id) ? prev : [...prev, c.id]))}
                              className="inline-block text-xs text-indigo-600 hover:underline break-all"
                              title={c.video_public_url}
                            >
                              Public clip URL
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span
                            title={c.video_error || ''}
                            className={`inline-block px-2 py-1 text-xs rounded-full font-medium ${clipStatusColor[c.video_status || 'missing'] || clipStatusColor.missing}`}
                          >
                            {c.video_status || 'missing'}
                          </span>
                          {c.video_error && (
                            <div className="text-xs text-red-600 max-w-[220px] truncate" title={c.video_error}>
                              {c.video_error}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.status === 'pending' && filter === 'pending' && (
                          <>
                            {hasRequiredActionFields(c) ? (
                              <>
                                <button
                                  onClick={() => handleAck(c.id)}
                                  disabled={statusActionId === c.id}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-full disabled:opacity-60"
                                >
                                  {statusActionId === c.id ? 'Updating...' : 'Acknowledge'}
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(c.id, 'resolved', 'False alarm marked as resolved.')}
                                  disabled={statusActionId === c.id}
                                  className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs rounded-full disabled:opacity-60"
                                >
                                  Decline (False Alarm)
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-500">Set severity and collision type to unlock actions.</span>
                            )}
                          </>
                        )}

                        {c.status === 'acknowledged' && filter === 'acknowledged' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(c.id, 'responded', 'Responder action logged.')}
                              disabled={statusActionId === c.id}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-full disabled:opacity-60"
                            >
                              {statusActionId === c.id ? 'Updating...' : 'Mark Responded'}
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(c.id, 'pending', 'Reverted to pending.')}
                              disabled={statusActionId === c.id}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-full disabled:opacity-60"
                            >
                              Undo
                            </button>
                          </>
                        )}

                        {filter === 'all' && (
                          <span className="text-xs text-gray-500">
                            {c.status === 'pending' && (hasRequiredActionFields(c)
                              ? 'Pending: awaiting captain/responder action.'
                              : 'Pending: set severity and collision type to unlock actions.')}
                            {c.status === 'acknowledged' && 'Acknowledged: awaiting captain/responder action.'}
                            {c.status === 'responded' && 'Responded: awaiting captain/responder resolution.'}
                            {c.status === 'resolved' && 'Resolved by action.'}
                          </span>
                        )}

                        {c.status === 'responded' && filter === 'responded' && (
                          <>
                            <button
                              onClick={() => handleStatusUpdate(c.id, 'resolved', 'Collision marked as resolved.')}
                              disabled={statusActionId === c.id}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-full disabled:opacity-60"
                            >
                              {statusActionId === c.id ? 'Updating...' : 'Mark Resolved'}
                            </button>
                            <button
                              onClick={() => handleStatusUpdate(c.id, 'acknowledged', 'Reverted to acknowledged.')}
                              disabled={statusActionId === c.id}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-full disabled:opacity-60"
                            >
                              Undo
                            </button>
                          </>
                        )}

                        {c.status === 'resolved' && filter === 'resolved' && (
                          <>
                            <span className="text-xs text-emerald-700 font-medium">Resolved</span>
                            <button
                              onClick={() => handleStatusUpdate(
                                c.id,
                                c.responded_at || c.responded_by ? 'responded' : 'pending',
                                'Collision reopened.'
                              )}
                              disabled={statusActionId === c.id}
                              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-full disabled:opacity-60"
                            >
                              Reopen
                            </button>
                          </>
                        )}

                        {c.status !== 'pending' && (
                          <span className="text-xs text-gray-500">
                            {renderStatusAudit(c) || '—'}
                          </span>
                        )}
                      </div>
                    </td>
                      </tr>
                    )
                  })()
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!loading && filtered.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3 text-sm text-gray-600">
          <div>
            Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-60"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500">Page {safePage} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>

    {viewer.open && viewer.collision && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-base font-semibold text-gray-900">
              Collision Clip - {viewer.collision.camera_name}
            </h4>
            <button
              onClick={closeViewer}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Close collision clip viewer"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="relative w-full rounded-lg overflow-hidden bg-black">
              <video
                controls
                autoPlay
                className="w-full max-h-[60vh] rounded-lg bg-black block"
                src={viewer.url}
                onTimeUpdate={event => setViewerPlaybackSecond(event.currentTarget.currentTime || 0)}
                onLoadedMetadata={event => setViewerPlaybackSecond(event.currentTarget.currentTime || 0)}
                onSeeked={event => setViewerPlaybackSecond(event.currentTarget.currentTime || 0)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Collision Time</p>
                <p className="font-medium text-gray-900">{formatApiDateTime(viewer.collision.timestamp)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Confidence</p>
                <div className="mt-1">
                  {renderConfidenceBadge(viewer.collision.confidence_score ?? viewer.collision.confidence)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Clip Window</p>
                <p className="font-medium text-gray-900">
                  {viewer.collision.video_pre_event_seconds || 0}s before, {viewer.collision.video_post_event_seconds || 0}s after
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Duration</p>
                <p className="font-medium text-gray-900">{viewer.collision.video_duration_seconds || 15}s</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Event Status</p>
                <p className="font-medium text-gray-900">{viewer.collision.status || 'N/A'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Severity</p>
                <div className="mt-1 capitalize">{renderSeverityBadge(viewer.collision.severity)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Collision Type</p>
                <p className="font-medium text-gray-900">{formatCollisionTypeLabel(viewer.collision.collision_type)}</p>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Emergency Review: Severity</p>
                  <p className="text-xs text-gray-500">Confirm the impact level after watching the replay.</p>
                </div>
                <div className="flex items-center gap-2">
                  {['low', 'medium', 'high'].map(level => (
                    <button
                      key={level}
                      onClick={() => handleSeverityUpdate(level)}
                      disabled={severitySaving || !reviewedCollisionIds.includes(viewer.collision.id)}
                      className={`${getSeverityButtonClass(level, viewer.collision.severity === level)}
                        ${severitySaving || !reviewedCollisionIds.includes(viewer.collision.id) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              {!reviewedCollisionIds.includes(viewer.collision.id) && (
                <p className="mt-3 text-xs text-gray-500">Play the replay to enable severity selection.</p>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Emergency Review: Collision Type</p>
                  <p className="text-xs text-gray-500">Select the classification based on the replay.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLLISION_TYPE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleCollisionTypeUpdate(option.value)}
                      disabled={typeSaving || !reviewedCollisionIds.includes(viewer.collision.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition
                        ${normalizeCollisionType(viewer.collision.collision_type) === option.value ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-50'}
                        ${typeSaving || !reviewedCollisionIds.includes(viewer.collision.id) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {!reviewedCollisionIds.includes(viewer.collision.id) && (
                <p className="mt-3 text-xs text-gray-500">Play the replay to enable collision type selection.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    </>
  )
}
