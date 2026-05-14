import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCameraStreamUrl, fetchCameras, fetchCollisions, simulateCollisionVideo } from '../api'
import useAutoRefresh from '../utils/useAutoRefresh'

const STREAM_CONNECT_TIMEOUT_MS = 20000
const STREAM_FAILURE_RETRY_LIMIT = 3
const SIMULATION_TIMEOUT_MS = 120000

function statusBadgeClass(status) {
  if (status === 'active') return 'bg-green-100 text-green-800'
  if (status === 'maintenance') return 'bg-yellow-100 text-yellow-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  if (status === 'error') return 'bg-red-100 text-red-800'
  if (status === 'simulation') return 'bg-indigo-100 text-indigo-800'
  return 'bg-gray-100 text-gray-700'
}

function StatTile({ icon, label, value, hint, tone = 'text-gray-900', iconBg = 'bg-gray-100', iconColor = 'text-gray-700' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}>
          <i className={`fas ${icon}`} />
        </div>
      </div>
    </div>
  )
}

export default function CameraDashboard({ user, notify, onNavigate, navigationState }) {
  const [cameras, setCameras] = useState([])
  const [collisions, setCollisions] = useState([])
  const [simulationFile, setSimulationFile] = useState(null)
  const [simulationCameraId, setSimulationCameraId] = useState('')
  const [simulationCreateEvent, setSimulationCreateEvent] = useState(true)
  const [simulationSendSms, setSimulationSendSms] = useState(true)
  const [simulationAnalysisFps, setSimulationAnalysisFps] = useState('')
  const [simulationMaxFrames, setSimulationMaxFrames] = useState('')
  const [simulationBusy, setSimulationBusy] = useState(false)
  const [simulationResult, setSimulationResult] = useState(null)
  const [simulationError, setSimulationError] = useState('')
  const [loading, setLoading] = useState(true)
  const [streamErrors, setStreamErrors] = useState({})
  const [streamConnected, setStreamConnected] = useState({})
  const [streamEverConnected, setStreamEverConnected] = useState({})
  const [streamRetryCounts, setStreamRetryCounts] = useState({})
  const [fullscreenCameraId, setFullscreenCameraId] = useState(() => (
    navigationState?.cameraId ? String(navigationState.cameraId) : null
  ))
  const [isWallFullscreen, setIsWallFullscreen] = useState(false)
  const [streamSessionById, setStreamSessionById] = useState({})
  const lastOpenedNavigationKeyRef = useRef('')
  const streamRetryTimersRef = useRef({})
  const streamLoadTimersRef = useRef({})

  const requestedCameraId = navigationState?.cameraId ? String(navigationState.cameraId) : ''
  const requestedNavigationKey = requestedCameraId
    ? `${requestedCameraId}:${navigationState?.ts ? String(navigationState.ts) : 'static'}`
    : ''

  const streamToken = useMemo(() => localStorage.getItem('token') || '', [])
  const isCaptain = String(user?.role || '').toLowerCase() === 'captain'

  const displayCameras = useMemo(() => cameras, [cameras])

  const streamableCameras = useMemo(
    () => cameras.filter(camera => {
      return camera && camera.status === 'active' && camera.rtsp_url && camera.id
    }),
    [cameras],
  )
  const mappedCameras = useMemo(
    () => cameras.filter(camera => camera && Number.isFinite(camera.map_latitude) && Number.isFinite(camera.map_longitude)).length,
    [cameras],
  )
  const failedCameras = useMemo(
    () => cameras.filter(camera => camera && (camera.status === 'failed' || camera.status === 'error')).length,
    [cameras],
  )
  const inactiveCameras = useMemo(
    () => cameras.filter(camera => camera && (camera.status === 'inactive' || camera.status === 'maintenance')).length,
    [cameras],
  )

  const hotspot = useMemo(() => {
    if (!collisions.length) return null

    const byCamera = {}
    for (const collision of collisions) {
      const key = collision.camera_name || 'Unknown camera'
      byCamera[key] = (byCamera[key] || 0) + 1
    }

    const [name, count] = Object.entries(byCamera).sort((a, b) => b[1] - a[1])[0]
    return { name, count }
  }, [collisions])

  const fullscreenCamera = useMemo(
    () => displayCameras.find(camera => camera.id === fullscreenCameraId) || null,
    [displayCameras, fullscreenCameraId],
  )

  const isFullscreenOpen = isWallFullscreen || !!fullscreenCameraId
  const isSingleFullscreen = isFullscreenOpen && !isWallFullscreen && !!fullscreenCameraId

  const fullscreenGridColumns = useMemo(() => {
    const count = Math.max(displayCameras.length, 1)
    if (count <= 1) return 1
    if (count <= 4) return 2
    if (count <= 9) return 3
    return 4
  }, [displayCameras.length])

  const activeStreamIds = useMemo(() => {
    if (isWallFullscreen) return streamableCameras.map(camera => camera.id)
    if (isFullscreenOpen) {
      return fullscreenCameraId ? [fullscreenCameraId] : []
    }
    return streamableCameras.map(camera => camera.id)
  }, [isWallFullscreen, isFullscreenOpen, fullscreenCameraId, streamableCameras])

  const enableStreamWatchdog = true

  async function load(options = {}) {
    const background = !!options.background
    try {
      const [cameraDocs, collisionDocs] = await Promise.all([fetchCameras(), fetchCollisions()])
      // Ensure all cameras have required fields to prevent crashes
      const validCameras = cameraDocs.filter(c => c && typeof c === 'object' && c.id)
      setCameras(validCameras)
      setCollisions(collisionDocs)
    } catch (err) {
      if (!background) {
        notify('Failed to load camera dashboard data.', 'error')
      }
      // On background refresh errors, don't crash - just retry next time
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 4000 })

  function handleSimulationFileChange(event) {
    const file = event.target?.files && event.target.files[0] ? event.target.files[0] : null
    setSimulationFile(file)
    setSimulationResult(null)
    setSimulationError('')
  }

  async function runSimulation() {
    if (simulationBusy) return
    if (!simulationFile) {
      notify('Select a video file to simulate.', 'warning')
      return
    }

    setSimulationBusy(true)
    setSimulationError('')
    setSimulationResult(null)

    const analysisFpsValue = Number.parseFloat(simulationAnalysisFps)
    const maxFramesValue = Number.parseInt(simulationMaxFrames, 10)

    try {
      const result = await simulateCollisionVideo(simulationFile, {
        cameraId: simulationCameraId || undefined,
        createEvent: simulationCreateEvent,
        sendSms: simulationCreateEvent && simulationSendSms,
        analysisFps: Number.isFinite(analysisFpsValue) ? analysisFpsValue : undefined,
        maxAnalyzedFrames: Number.isFinite(maxFramesValue) ? maxFramesValue : undefined,
        timeoutMs: SIMULATION_TIMEOUT_MS,
      })

      setSimulationResult(result)

      if (result?.detected) {
        notify(result?.event_created ? 'Collision detected and logged.' : 'Collision detected in simulation.', 'success')
        if (result?.event_created) {
          await load({ background: true })
        }
      } else {
        notify(result?.detail || 'No collision detected in simulation.', 'info')
      }
    } catch (err) {
      let detail = err?.response?.data?.detail || 'Failed to analyze simulation video.'
      const payload = err?.response?.data
      if (payload instanceof Blob) {
        try {
          const text = await payload.text()
          const parsed = JSON.parse(text)
          detail = parsed?.detail || detail
        } catch {
          detail = detail
        }
      }
      setSimulationError(detail)
      notify(detail, 'error')
    } finally {
      setSimulationBusy(false)
    }
  }

  useEffect(() => {
    const streamableIds = new Set(streamableCameras.map(camera => camera.id))

    setStreamErrors(prev => {
      const next = {}
      for (const [cameraId, message] of Object.entries(prev)) {
        if (streamableIds.has(cameraId)) next[cameraId] = message
      }
      return next
    })

    setStreamConnected(prev => {
      const next = {}
      for (const [cameraId, isConnected] of Object.entries(prev)) {
        if (streamableIds.has(cameraId)) next[cameraId] = isConnected
      }
      return next
    })

    setStreamEverConnected(prev => {
      const next = {}
      for (const [cameraId, hasConnected] of Object.entries(prev)) {
        if (streamableIds.has(cameraId)) next[cameraId] = hasConnected
      }
      return next
    })
  }, [streamableCameras])

  useEffect(() => {
    const timers = streamLoadTimersRef.current
    const activeIds = new Set(activeStreamIds)

    Object.keys(timers).forEach(cameraId => {
      if (!activeIds.has(cameraId) || !enableStreamWatchdog) {
        window.clearTimeout(timers[cameraId])
        delete timers[cameraId]
      }
    })

    if (!enableStreamWatchdog) return

    activeStreamIds.forEach(cameraId => {
      if (!cameraId) return
      if (streamConnected[cameraId]) {
        clearStreamLoadTimer(cameraId)
        return
      }
      if (timers[cameraId]) return

      timers[cameraId] = window.setTimeout(() => {
        delete timers[cameraId]
        setStreamErrors(prev => ({
          ...prev,
          [cameraId]: 'Stream timed out. Retrying...'
        }))
        setStreamRetryCounts(prev => ({
          ...prev,
          [cameraId]: (prev[cameraId] || 0) + 1,
        }))
      }, STREAM_CONNECT_TIMEOUT_MS)
    })
  }, [activeStreamIds, enableStreamWatchdog, streamConnected, streamRetryCounts])

  useEffect(() => {
    return () => {
      Object.values(streamRetryTimersRef.current).forEach(timerId => window.clearTimeout(timerId))
      streamRetryTimersRef.current = {}
    }
  }, [])


  useEffect(() => {
    if (!isFullscreenOpen) return

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setIsWallFullscreen(false)
        setFullscreenCameraId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFullscreenOpen])

  useEffect(() => {
    if (fullscreenCameraId && !displayCameras.some(camera => camera.id === fullscreenCameraId)) {
      setFullscreenCameraId(null)
    }
  }, [displayCameras, fullscreenCameraId])

  useEffect(() => {
    if (!requestedCameraId) return

    const exists = cameras.some(camera => camera && camera.id === requestedCameraId)
    if (!exists) return

    if (requestedNavigationKey && requestedNavigationKey === lastOpenedNavigationKeyRef.current) return

    if (requestedNavigationKey) {
      lastOpenedNavigationKeyRef.current = requestedNavigationKey
    }

    if (fullscreenCameraId !== requestedCameraId) {
      setIsWallFullscreen(false)
      setFullscreenCameraId(requestedCameraId)
    }
  }, [requestedCameraId, requestedNavigationKey, cameras, fullscreenCameraId])

  function openCameraFullscreen(cameraId) {
    setIsWallFullscreen(false)
    setFullscreenCameraId(cameraId)
  }

  function openWallFullscreen() {
    setFullscreenCameraId(null)
    setIsWallFullscreen(true)
  }

  function closeFullscreen() {
    setIsWallFullscreen(false)
    setFullscreenCameraId(null)
  }

  function scheduleStreamRetry(cameraId) {
    if (!cameraId || streamRetryTimersRef.current[cameraId]) return

    streamRetryTimersRef.current[cameraId] = window.setTimeout(() => {
      delete streamRetryTimersRef.current[cameraId]
      setStreamRetryCounts(prev => ({
        ...prev,
        [cameraId]: (prev[cameraId] || 0) + 1,
      }))
    }, 2500)
  }

  function clearStreamRetry(cameraId) {
    const timerId = streamRetryTimersRef.current[cameraId]
    if (timerId) {
      window.clearTimeout(timerId)
      delete streamRetryTimersRef.current[cameraId]
    }
  }

  function clearStreamLoadTimer(cameraId) {
    const timerId = streamLoadTimersRef.current[cameraId]
    if (timerId) {
      window.clearTimeout(timerId)
      delete streamLoadTimersRef.current[cameraId]
    }
  }

  function bumpStreamSession(cameraIds) {
    const ids = Array.isArray(cameraIds) ? cameraIds.filter(Boolean) : [cameraIds].filter(Boolean)
    if (!ids.length) return

    setStreamSessionById(prev => {
      const next = { ...prev }
      ids.forEach(id => {
        next[id] = (next[id] || 0) + 1
      })
      return next
    })

    setStreamErrors(prev => {
      const next = { ...prev }
      ids.forEach(id => {
        delete next[id]
      })
      return next
    })

    setStreamConnected(prev => {
      const next = { ...prev }
      ids.forEach(id => {
        next[id] = false
      })
      return next
    })

    setStreamRetryCounts(prev => {
      const next = { ...prev }
      ids.forEach(id => {
        delete next[id]
      })
      return next
    })
  }

  function renderStreamSurface(camera, mode = 'card', options = {}) {
    const { suspend = false, disableOverlay = false } = options
    const frameClass = mode === 'card' ? 'aspect-video bg-gray-900' : 'h-full bg-black'
    const messageClass =
      mode === 'card'
        ? 'w-full h-full flex items-center justify-center text-gray-300 text-sm px-4 text-center'
        : 'w-full h-full flex items-center justify-center text-gray-300 text-xs px-3 text-center'

    if (suspend) {
      return (
        <div className={frameClass}>
          <div className={messageClass}>
            Live output paused while fullscreen is open.
          </div>
        </div>
      )
    }

    const canStream = camera.status === 'active' && camera.rtsp_url
    const streamError = streamErrors[camera.id]
    const retryCount = streamRetryCounts[camera.id] || 0
    const failureMessage = retryCount >= STREAM_FAILURE_RETRY_LIMIT
      ? 'Failed to connect to live feed. Check CCTV connection.'
      : streamError
    const streamSessionId = streamSessionById[camera.id] || 0
    const baseStreamUrl = canStream ? buildCameraStreamUrl(camera.id, streamToken) : ''
    const streamUrl = baseStreamUrl
      ? `${baseStreamUrl}${baseStreamUrl.includes('?') ? '&' : '?'}retry=${retryCount}&session=${streamSessionId}${disableOverlay ? '&overlay=0' : ''}`
      : ''

    return (
      <div className={frameClass}>
        {canStream ? (
          <div className="relative w-full h-full">
            <img
              key={`${camera.id}-${streamSessionId}-${retryCount}`}
              src={streamUrl}
              alt={`${camera.name} live`}
              className="w-full h-full object-cover"
              onError={() => {
                clearStreamLoadTimer(camera.id)
                setStreamErrors(prev => ({ ...prev, [camera.id]: 'Live stream unavailable for this camera.' }))
                setStreamConnected(prev => ({ ...prev, [camera.id]: false }))
                scheduleStreamRetry(camera.id)
              }}
              onLoad={() => {
                clearStreamLoadTimer(camera.id)
                clearStreamRetry(camera.id)
                setStreamErrors(prev => {
                  if (!prev[camera.id]) return prev
                  const next = { ...prev }
                  delete next[camera.id]
                  return next
                })
                setStreamConnected(prev => ({ ...prev, [camera.id]: true }))
                setStreamEverConnected(prev => ({ ...prev, [camera.id]: true }))
              }}
            />
            {streamError && (
              <div className="absolute left-2 bottom-2 max-w-[85%] rounded bg-black/70 px-2 py-1 text-[10px] text-white">
                {failureMessage}
              </div>
            )}
          </div>
        ) : (
          <div className={messageClass}>
            Live output unavailable for this camera.
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="fas fa-spinner fa-spin text-emerald-500 text-3xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatTile
          icon="fa-video"
          label="Total Cameras"
          value={cameras.length}
          hint="All configured camera units"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatTile
          icon="fa-broadcast-tower"
          label="Live Ready"
          value={streamableCameras.length}
          hint="Active with private stream source"
          tone="text-emerald-700"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon="fa-map-marker-alt"
          label="Mapped"
          value={mappedCameras}
          hint="Placed on location map"
          tone="text-cyan-700"
          iconBg="bg-cyan-50"
          iconColor="text-cyan-600"
        />
        <StatTile
          icon="fa-triangle-exclamation"
          label="Failed"
          value={failedCameras}
          hint="Needs reconnect or review"
          tone="text-red-700"
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatTile
          icon="fa-fire"
          label="Top Hotspot"
          value={hotspot?.name || 'N/A'}
          hint={hotspot ? `${hotspot.count} incident(s)` : 'No collisions yet'}
          tone="text-orange-700"
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center space-x-2">
            <i className="fas fa-upload text-emerald-500" />
            <h3 className="text-lg font-medium text-gray-900">Collision Simulation Upload</h3>
          </div>
          <p className="text-xs text-gray-500">
            Upload a recorded clip to test collision detection and optionally log an event.
          </p>
        </div>

        <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Simulation Video
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={handleSimulationFileChange}
                disabled={simulationBusy}
                className="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 disabled:opacity-60"
              />
              {simulationFile && (
                <p className="mt-2 text-xs text-gray-500">
                  Selected: {simulationFile.name} ({(simulationFile.size / (1024 * 1024)).toFixed(1)} MB)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Associate with Camera (optional)
              </label>
              <select
                value={simulationCameraId}
                onChange={e => setSimulationCameraId(e.target.value)}
                disabled={simulationBusy}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-100"
              >
                <option value="">Simulation Upload (no camera)</option>
                {displayCameras.map(camera => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name} · {camera.location}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Analysis FPS (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={simulationAnalysisFps}
                  onChange={e => setSimulationAnalysisFps(e.target.value)}
                  disabled={simulationBusy}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-100"
                  placeholder="e.g. 6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Analyzed Frames (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={simulationMaxFrames}
                  onChange={e => setSimulationMaxFrames(e.target.value)}
                  disabled={simulationBusy}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-gray-100"
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Create collision event</p>
                <p className="text-xs text-gray-500">Logs a collision entry if detection succeeds.</p>
              </div>
              <button
                type="button"
                onClick={() => setSimulationCreateEvent(prev => !prev)}
                disabled={simulationBusy}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${simulationCreateEvent ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${simulationCreateEvent ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Send SMS on detection</p>
                <p className="text-xs text-gray-500">Requires event creation to be enabled.</p>
              </div>
              <button
                type="button"
                onClick={() => setSimulationSendSms(prev => !prev)}
                disabled={simulationBusy || !simulationCreateEvent}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${simulationSendSms && simulationCreateEvent ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${simulationSendSms && simulationCreateEvent ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            {simulationError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                {simulationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={runSimulation}
                disabled={simulationBusy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {simulationBusy ? 'Analyzing...' : 'Run Simulation'}
              </button>
            </div>
          </div>

          <div>
            {simulationResult ? (
              <div className={`rounded-lg border p-4 ${simulationResult.detected ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-gray-500">Result</p>
                  <span className={`px-2 py-1 text-xs rounded-full font-semibold ${simulationResult.detected ? 'bg-emerald-200 text-emerald-900' : 'bg-gray-200 text-gray-700'}`}>
                    {simulationResult.detected ? 'Collision detected' : 'No collision detected'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">
                  {simulationResult.detail || (simulationResult.detected
                    ? 'Collision candidate detected in the uploaded video.'
                    : 'No collision detected in the uploaded video.')}
                </p>
                {simulationResult.filename && (
                  <p className="mt-2 text-xs text-gray-500">File: {simulationResult.filename}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-600">
                  <div>
                    Confidence: {Number.isFinite(Number(simulationResult.confidence))
                      ? `${(Number(simulationResult.confidence) * 100).toFixed(0)}%`
                      : 'N/A'}
                  </div>
                  <div>
                    Analyzed frames: {Number.isFinite(Number(simulationResult.analyzed_frames))
                      ? simulationResult.analyzed_frames
                      : 'N/A'}
                  </div>
                  <div>
                    Detected at: {Number.isFinite(Number(simulationResult.detected_at_second))
                      ? `${Number(simulationResult.detected_at_second).toFixed(2)}s`
                      : 'N/A'}
                  </div>
                  <div>
                    Sample rate: {Number.isFinite(Number(simulationResult.sampled_every_n_frames))
                      ? `1 / ${simulationResult.sampled_every_n_frames}`
                      : 'N/A'}
                  </div>
                </div>
                {simulationResult.event_created && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-emerald-900">
                    <p className="font-semibold">Event created</p>
                    <p>Collision ID: {simulationResult.collision_id}</p>
                    <p>Camera: {simulationResult.camera_name || 'Simulation Upload'}</p>
                    {simulationResult.video_public_url && (
                      <a
                        href={simulationResult.video_public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-emerald-700 underline"
                      >
                        Open clip
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-500 flex items-center justify-center text-center">
                Upload a video and run a simulation to see detection details here.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={isWallFullscreen ? 'fixed inset-0 z-40 bg-black' : 'bg-white rounded-lg shadow-sm border border-gray-200'}>
        {!isFullscreenOpen && (
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center space-x-2">
              <i className="fas fa-th-large text-blue-500" />
              <h3 className="text-lg font-medium text-gray-900">All CCTV Live Output</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{streamableCameras.length} live / {cameras.length} total</span>
              <button
                type="button"
                onClick={openWallFullscreen}
                className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
              >
                <i className="fas fa-expand mr-1" />
                Fullscreen Wall
              </button>
              <button
                onClick={() => onNavigate?.('cameraLocations')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Open Map
              </button>
              {isCaptain && (
                <button
                  onClick={() => onNavigate?.('cameras')}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Manage Cameras
                </button>
              )}
            </div>
          </div>
        )}

        <div className={isWallFullscreen ? 'h-full pt-14 px-3 pb-3' : 'p-6'}>
          {displayCameras.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <i className="fas fa-video text-3xl mb-2 block text-gray-300" />
              No cameras configured yet.
            </div>
          ) : (
            <>
              {(failedCameras > 0 || inactiveCameras > 0) && (
                <div className="mb-4 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-900">
                  {failedCameras > 0 && <p>{failedCameras} camera(s) are in failed/error state.</p>}
                  {inactiveCameras > 0 && <p>{inactiveCameras} camera(s) are inactive or under maintenance.</p>}
                </div>
              )}

              <div
                className={isWallFullscreen ? 'grid h-full gap-2' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'}
                style={isWallFullscreen ? {
                  gridTemplateColumns: `repeat(${fullscreenGridColumns}, minmax(0, 1fr))`,
                  gridAutoRows: 'minmax(0, 1fr)',
                } : undefined}
              >
                {displayCameras.map(camera => {
                  const canStream = camera.status === 'active' && camera.rtsp_url
                  const isConnected = !!streamConnected[camera.id]
                  const hasConnectedBefore = !!streamEverConnected[camera.id]
                  const streamError = streamErrors[camera.id]
                  const retryCount = streamRetryCounts[camera.id] || 0
                  const hasFailed = !isConnected && !!streamError && retryCount >= STREAM_FAILURE_RETRY_LIMIT
                  const streamStatusLabel = isConnected
                    ? 'Connected'
                    : hasFailed
                      ? 'Failed'
                      : streamError
                        ? 'Retrying'
                        : hasConnectedBefore
                          ? 'Reconnecting'
                          : 'Connecting'
                  const streamStatusClass = isConnected
                    ? 'bg-emerald-100 text-emerald-700'
                    : hasFailed
                      ? 'bg-red-100 text-red-700'
                      : streamError || hasConnectedBefore
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                  const streamSourceText = camera.rtsp_url
                    ? 'Configured (private)'
                    : 'Not configured'
                  const descriptionText = camera.description || 'No description provided.'
                  const isSelectedFullscreen = isSingleFullscreen && camera.id === fullscreenCameraId
                  const isHiddenByFullscreen = isSingleFullscreen && camera.id !== fullscreenCameraId

                  if (isHiddenByFullscreen) return null

                  const tileClass = isSelectedFullscreen
                    ? 'fixed inset-0 z-50 bg-black'
                    : isWallFullscreen
                      ? 'relative min-h-0 rounded-md border border-gray-800 overflow-hidden bg-black'
                      : 'rounded-lg border border-gray-200 overflow-hidden bg-white'
                  const showMeta = !(isWallFullscreen || isSelectedFullscreen)
                  const streamMode = isSelectedFullscreen || isWallFullscreen ? 'fullscreen' : 'card'

                  return (
                    <div key={camera.id} className={tileClass}>
                      {showMeta && (
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{camera.name}</p>
                            <p className="text-xs text-gray-500">{camera.location}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {canStream && (
                              <span
                                className={`px-2 py-1 text-[10px] rounded-full font-semibold uppercase tracking-wide ${streamStatusClass}`}
                              >
                                {streamStatusLabel}
                              </span>
                            )}
                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusBadgeClass(camera.status)}`}>
                              {camera.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => openCameraFullscreen(camera.id)}
                              className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                              title={`Fullscreen ${camera.name}`}
                            >
                              <i className="fas fa-expand text-[11px]" />
                            </button>
                          </div>
                        </div>
                      )}

                      {renderStreamSurface(camera, streamMode, {
                        suspend: isFullscreenOpen && !isSelectedFullscreen && !isWallFullscreen,
                      })}

                      {isWallFullscreen && (
                        <div className="absolute top-2 left-2 max-w-[78%] px-2 py-1 rounded bg-black/70 text-white text-[11px] truncate">
                          {camera.name}
                        </div>
                      )}

                      {showMeta && (
                        <div className="px-4 py-3 text-xs text-gray-500 space-y-1">
                          <p>Stream source: {streamSourceText}</p>
                          <p>{descriptionText}</p>
                        </div>
                      )}

                      {isSelectedFullscreen && (
                        <div className="absolute left-3 bottom-3 px-3 py-1.5 rounded bg-black/65 text-white text-xs max-w-[85%] truncate">
                          {camera.name} • {camera.location}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {isFullscreenOpen && (
        <div className="fixed inset-x-0 top-0 z-60 px-4 py-3 border-b border-gray-700 bg-black/90 flex items-center justify-between gap-3">
          <div className="text-white min-w-0">
            <p className="text-sm font-semibold truncate">
              {isWallFullscreen
                ? 'All Cameras Fullscreen Wall'
                : `${fullscreenCamera?.name || 'Camera'} Fullscreen`}
            </p>
            <p className="text-xs text-gray-300">
              Press ESC to close fullscreen.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isWallFullscreen && (
              <button
                type="button"
                onClick={openWallFullscreen}
                className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
              >
                <i className="fas fa-th mr-1" />
                Wall View
              </button>
            )}
            <button
              type="button"
              onClick={closeFullscreen}
              className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
            >
              <i className="fas fa-compress mr-1" />
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
