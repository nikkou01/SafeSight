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

export default function Collisions({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [loadingVideoId, setLoadingVideoId] = useState('')
  const [statusActionId, setStatusActionId] = useState('')
  const [severitySaving, setSeveritySaving] = useState(false)
  const [typeSaving, setTypeSaving] = useState(false)
  const [reviewedCollisionIds, setReviewedCollisionIds] = useState([])
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
    if (!collisionId || !reviewedCollisionIds.includes(collisionId)) {
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
    if (!collisionId || !reviewedCollisionIds.includes(collisionId)) {
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
    setViewerPlaybackSecond(0)
    try {
      const blob = await fetchCollisionVideoBlob(collision.id)
      const url = URL.createObjectURL(blob)
      setViewer(prev => {
        if (prev.url) URL.revokeObjectURL(prev.url)
        return { open: true, url, collision }
      })
      setReviewedCollisionIds(prev => (prev.includes(collision.id) ? prev : [...prev, collision.id]))
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
    acknowledged: 'bg-blue-100 text-blue-800',
    responded:    'bg-purple-100 text-purple-800',
    resolved:     'bg-green-100 text-green-800',
  }
  const clipStatusColor = {
    ready: 'bg-green-100 text-green-800',
    processing: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    missing: 'bg-gray-100 text-gray-600',
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
    let className = 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (value < 0.75) {
      className = 'bg-red-100 text-red-800 border-red-200'
    } else if (value < 0.8) {
      className = 'bg-amber-100 text-amber-800 border-amber-200'
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
    let className = 'bg-gray-100 text-gray-700 border-gray-200'
    if (value === 'medium') className = 'bg-amber-100 text-amber-800 border-amber-200'
    if (value === 'low') className = 'bg-slate-100 text-slate-700 border-slate-200'
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
    let className = 'bg-gray-100 text-gray-700 border-gray-200'

    if (normalized === 'single_vehicle') className = 'bg-sky-100 text-sky-800 border-sky-200'
    if (normalized === 'rear_end') className = 'bg-amber-100 text-amber-800 border-amber-200'
    if (normalized === 'head_on') className = 'bg-red-100 text-red-800 border-red-200'
    if (normalized === 'side_impact') className = 'bg-violet-100 text-violet-800 border-violet-200'
    if (normalized === 'multi_vehicle') className = 'bg-emerald-100 text-emerald-800 border-emerald-200'

    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
        {label}
      </span>
    )
  }

  function formatCsvValue(value) {
    if (value === null || value === undefined) return ''
    const stringValue = String(value)
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }
    return stringValue
  }

  function exportCollisionLogs() {
    const rows = filtered
    if (!rows.length) {
      notify('No collision logs to export.', 'warning')
      return
    }

    const headers = [
      'ID',
      'Camera',
      'Location',
      'Timestamp',
      'Confidence',
      'Severity',
      'Collision Type',
      'Status',
      'Clip Status',
    ]

    const csvRows = rows.map(collision => {
      const confidenceRaw = collision.confidence_score ?? collision.confidence
      const confidenceValue = Number(confidenceRaw)
      const confidenceLabel = Number.isFinite(confidenceValue) ? `${(confidenceValue * 100).toFixed(1)}%` : ''
      const clipStatus = collision.video_status || (collision.video_file_id ? 'ready' : 'missing')

      return [
        collision.id,
        collision.camera_name,
        collision.camera_location,
        formatApiDateTime(collision.timestamp),
        confidenceLabel,
        collision.severity || 'unreviewed',
        formatCollisionTypeLabel(collision.collision_type),
        collision.status,
        clipStatus,
      ]
    })

    const csvContent = [headers, ...csvRows]
      .map(row => row.map(formatCsvValue).join(','))
      .join('\n')

    const exportFilter = filter === 'all' ? 'all' : filter
    const dateStamp = new Date().toISOString().slice(0, 10)
    const fileName = `collision-logs-${exportFilter}-${dateStamp}.csv`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-medium text-gray-900">Collision Detection Logs</h3>
        <div className="flex space-x-2">
          {['all', 'pending', 'acknowledged', 'responded', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors
                ${filter === f ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f}
            </button>
          ))}
          <button
            onClick={exportCollisionLogs}
            disabled={loading || filtered.length === 0}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs disabled:opacity-60"
            title="Export current filter to CSV"
          >
            <i className="fas fa-file-export" />
          </button>
          <button onClick={() => load()} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs">
            <i className="fas fa-sync-alt" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <i className="fas fa-check-circle text-4xl mb-3 block text-green-300" />
          No {filter !== 'all' ? filter : ''} collision events.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Camera', 'Location', 'Time', 'Confidence', 'Severity', 'Type', 'Status', 'Clip', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.camera_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.camera_location}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatApiDateTime(c.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {renderConfidenceBadge(c.confidence_score ?? c.confidence)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {renderSeverityBadge(c.severity)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {renderCollisionTypeBadge(c.collision_type)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor[c.status] || 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
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
                      {c.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAck(c.id)}
                            disabled={statusActionId === c.id}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-full disabled:opacity-60"
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
                      )}

                      {c.status === 'acknowledged' && (
                        <button
                          onClick={() => handleStatusUpdate(c.id, 'responded', 'Responder action logged.')}
                          disabled={statusActionId === c.id}
                          className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded-full disabled:opacity-60"
                        >
                          {statusActionId === c.id ? 'Updating...' : 'Mark Responded'}
                        </button>
                      )}

                      {c.status === 'responded' && (
                        <button
                          onClick={() => handleStatusUpdate(c.id, 'resolved', 'Collision marked as resolved.')}
                          disabled={statusActionId === c.id}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-full disabled:opacity-60"
                        >
                          {statusActionId === c.id ? 'Updating...' : 'Mark Resolved'}
                        </button>
                      )}

                      {c.status === 'resolved' && (
                        <span className="text-xs text-emerald-700 font-medium">Resolved</span>
                      )}

                      {c.status !== 'pending' && (
                        <span className="text-xs text-gray-500">
                          {renderStatusAudit(c) || '—'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <p className="font-medium text-gray-900 capitalize">{viewer.collision.severity || 'unreviewed'}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500 text-xs">Collision Type</p>
                <p className="font-medium text-gray-900">{formatCollisionTypeLabel(viewer.collision.collision_type)}</p>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Review clip then set severity</p>
                  <p className="text-xs text-gray-500">Choose the level that matches what you saw in the clip.</p>
                </div>
                <div className="flex items-center gap-2">
                  {['low', 'medium', 'high'].map(level => (
                    <button
                      key={level}
                      onClick={() => handleSeverityUpdate(level)}
                      disabled={severitySaving || !reviewedCollisionIds.includes(viewer.collision.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition
                        ${viewer.collision.severity === level ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}
                        ${severitySaving || !reviewedCollisionIds.includes(viewer.collision.id) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              {!reviewedCollisionIds.includes(viewer.collision.id) && (
                <p className="mt-3 text-xs text-amber-600">Play the clip to enable severity selection.</p>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Review clip then set collision type</p>
                  <p className="text-xs text-gray-500">Pick the collision classification based on what happened.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLLISION_TYPE_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleCollisionTypeUpdate(option.value)}
                      disabled={typeSaving || !reviewedCollisionIds.includes(viewer.collision.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition
                        ${normalizeCollisionType(viewer.collision.collision_type) === option.value ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}
                        ${typeSaving || !reviewedCollisionIds.includes(viewer.collision.id) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {!reviewedCollisionIds.includes(viewer.collision.id) && (
                <p className="mt-3 text-xs text-amber-600">Play the clip to enable collision type selection.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    </>
  )
}
