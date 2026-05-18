import { useState } from 'react'
import { fetchCameras, createCamera, updateCamera, reconnectCamera, deleteCamera } from '../api'
import useAutoRefresh from '../utils/useAutoRefresh'

const DEFAULT_RTSP_PORT = '554'
const DEFAULT_RTSP_PATH = '/cam/realmonitor?channel=1&subtype=1'

const EMPTY = {
  name: '',
  location: '',
  description: '',
  rtsp_mode: 'fields',
  rtsp_username: '',
  rtsp_password: '',
  rtsp_host: '',
  rtsp_port: DEFAULT_RTSP_PORT,
  rtsp_path: DEFAULT_RTSP_PATH,
  rtsp_url_raw: '',
}

function normalizeRtspPath(path) {
  const trimmed = String(path || '').trim()
  if (!trimmed) return DEFAULT_RTSP_PATH
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function buildRtspUrl({ username, password, host, port, path }) {
  const cleanHost = String(host || '').trim()
  if (!cleanHost) return ''
  const cleanPort = String(port || DEFAULT_RTSP_PORT).trim()
  const cleanPath = normalizeRtspPath(path)
  let auth = ''
  if (username || password) {
    const user = encodeURIComponent(username || '')
    const pass = encodeURIComponent(password || '')
    auth = `${user}${pass ? `:${pass}` : ''}@`
  }
  return `rtsp://${auth}${cleanHost}:${cleanPort}${cleanPath}`
}

function buildRtspPreview({ username, password, host, port, path }) {
  const cleanHost = String(host || '').trim()
  if (!cleanHost) return ''
  const cleanPort = String(port || DEFAULT_RTSP_PORT).trim()
  const cleanPath = normalizeRtspPath(path)
  if (username || password) {
    const authUser = username || ''
    const authPass = password ? '****' : ''
    const auth = `${authUser}${authPass ? `:${authPass}` : ''}@`
    return `rtsp://${auth}${cleanHost}:${cleanPort}${cleanPath}`
  }
  return `rtsp://${cleanHost}:${cleanPort}${cleanPath}`
}

function parseRtspUrl(rtspUrl) {
  const raw = String(rtspUrl || '').trim()
  if (!raw) {
    return {
      mode: 'fields',
      username: '',
      password: '',
      host: '',
      port: DEFAULT_RTSP_PORT,
      path: DEFAULT_RTSP_PATH,
      raw: '',
    }
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'rtsp:') throw new Error('Unsupported RTSP scheme')
    const path = `${parsed.pathname || ''}${parsed.search || ''}` || DEFAULT_RTSP_PATH
    return {
      mode: 'fields',
      username: safeDecode(parsed.username || ''),
      password: safeDecode(parsed.password || ''),
      host: parsed.hostname || '',
      port: parsed.port || DEFAULT_RTSP_PORT,
      path: path || DEFAULT_RTSP_PATH,
      raw,
    }
  } catch {
    return {
      mode: 'raw',
      username: '',
      password: '',
      host: '',
      port: DEFAULT_RTSP_PORT,
      path: DEFAULT_RTSP_PATH,
      raw,
    }
  }
}

export default function Cameras({ user, notify }) {
  const [cameras,  setCameras]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)   // 'add' | 'edit' | false
  const [form,     setForm]     = useState(EMPTY)
  const [editId,   setEditId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [actionBusyById, setActionBusyById] = useState({})
  const isCaptain = user?.role === 'captain'

  async function load(options = {}) {
    const background = !!options.background
    try {
      const cameraDocs = await fetchCameras()
      // Filter out invalid camera objects
      const validCameras = Array.isArray(cameraDocs) 
        ? cameraDocs.filter(c => c && typeof c === 'object' && c.id)
        : []
      setCameras(validCameras)
    } catch (err) {
      if (!background) notify('Failed to load cameras.', 'error')
      // Keep existing cameras on error to avoid losing data
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 5000 })

  function getErrorDetail(err, fallback) {
    return err?.response?.data?.detail || fallback
  }

  function openAdd()      { setForm(EMPTY); setEditId(null); setModal('add') }
  function openEdit(cam)  {
    const parsed = parseRtspUrl(cam.rtsp_url)
    setForm({
      name: cam.name,
      location: cam.location,
      description: cam.description || '',
      rtsp_mode: parsed.mode,
      rtsp_username: parsed.username,
      rtsp_password: parsed.password,
      rtsp_host: parsed.host,
      rtsp_port: parsed.port,
      rtsp_path: parsed.path,
      rtsp_url_raw: parsed.raw,
    })
    setEditId(cam.id)
    setModal('edit')
  }
  function closeModal()   { setModal(false); setEditId(null); setForm(EMPTY) }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const rtspFields = {
        username: form.rtsp_username,
        password: form.rtsp_password,
        host: form.rtsp_host,
        port: form.rtsp_port,
        path: form.rtsp_path,
      }
      const rtsp_url = form.rtsp_mode === 'raw'
        ? String(form.rtsp_url_raw || '').trim()
        : buildRtspUrl(rtspFields)
      const payload = {
        name: form.name,
        location: form.location,
        rtsp_url,
        description: form.description || '',
      }
      if (modal === 'add') {
        await createCamera(payload)
        notify('Camera added. Validating stream...', 'success')
      } else {
        await updateCamera(editId, payload)
        notify('Camera updated.', 'success')
      }
      closeModal()
      // Reload with background false to show loading spinner during validation
      await load()
    } catch (err) {
      const errorMsg = getErrorDetail(err, 'Failed to save camera.')
      notify(errorMsg, 'error')
      // If RTSP validation failed, keep modal open so user can fix the URL
      if (errorMsg.includes('RTSP') || errorMsg.includes('stream')) {
        // Keep the form intact for correction
      }
    } finally { setSaving(false) }
  }

  async function runRowAction(cameraId, work) {
    setActionBusyById(prev => ({ ...prev, [cameraId]: true }))
    try {
      await work()
    } finally {
      setActionBusyById(prev => {
        const next = { ...prev }
        delete next[cameraId]
        return next
      })
    }
  }

  async function handleDisable(camera) {
    if (!confirm(`Disable ${camera.name}?`)) return

    await runRowAction(camera.id, async () => {
      try {
        await updateCamera(camera.id, { status: 'inactive' })
        notify('Camera disabled.', 'success')
        await load()
      } catch (err) {
        notify(getErrorDetail(err, 'Failed to disable camera.'), 'error')
      }
    })
  }

  async function handleReconnect(camera) {
    await runRowAction(camera.id, async () => {
      try {
        await reconnectCamera(camera.id)
        notify('Camera reconnected and enabled.', 'success')
        await load()
      } catch (err) {
        notify(getErrorDetail(err, 'Failed to reconnect camera.'), 'error')
      }
    })
  }

  async function handleDelete(id) {
    if (!confirm('Delete this camera?')) return
    try {
      await deleteCamera(id)
      notify('Camera deleted.', 'success')
      load()
    } catch {
      notify('Failed to delete camera.', 'error')
    }
  }

  const statusColor = {
    active:      'bg-green-100 text-green-800',
    inactive:    'bg-gray-100 text-gray-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    failed:      'bg-red-100 text-red-800',
    error:       'bg-red-100 text-red-800',
  }

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Camera Management</h3>
          {isCaptain && (
            <button onClick={openAdd}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">
              <i className="fas fa-plus mr-2" />Add Camera
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <i className="fas fa-spinner fa-spin text-emerald-500 text-2xl" />
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <i className="fas fa-video text-4xl mb-3 block text-gray-300" />
            No cameras configured yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {cameras.map(cam => (
              <div key={cam.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-video text-green-600 text-xl" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{cam.name}</h4>
                    <p className="text-sm text-gray-600">{cam.location}</p>
                    <p className="text-xs text-gray-400">
                      Stream source: {cam.rtsp_url ? 'Configured (private)' : 'Not configured'}
                    </p>
                    {cam.status === 'failed' && cam.last_stream_error && (
                      <p className="text-xs text-red-600 mt-1">{cam.last_stream_error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColor[cam.status] || 'bg-gray-100 text-gray-600'}`}>
                    {cam.status}
                  </span>
                  {isCaptain && (
                    <>
                      {cam.status === 'active' && (
                        <button
                          onClick={() => handleDisable(cam)}
                          disabled={!!actionBusyById[cam.id]}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded text-xs disabled:opacity-50"
                        >
                          Disable
                        </button>
                      )}
                      {(cam.status === 'inactive' || cam.status === 'failed' || cam.status === 'error') && (
                        <button
                          onClick={() => handleReconnect(cam)}
                          disabled={!!actionBusyById[cam.id]}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs disabled:opacity-50"
                        >
                          {cam.status === 'inactive' ? 'Enable' : 'Reconnect'}
                        </button>
                      )}
                      <button onClick={() => openEdit(cam)}
                        disabled={!!actionBusyById[cam.id]}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs disabled:opacity-50">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(cam.id)}
                        disabled={!!actionBusyById[cam.id]}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs disabled:opacity-50">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{modal === 'add' ? 'Add Camera' : 'Edit Camera'}</h3>
              <button onClick={closeModal}><i className="fas fa-times text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Camera Name</label>
                <input type="text" required value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" required value={form.location}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div className="text-sm font-medium text-gray-700">CCTV Stream</div>

                {form.rtsp_mode === 'raw' ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">RTSP URL</label>
                      <input
                        type="text"
                        required
                        value={form.rtsp_url_raw}
                        onChange={e => setForm(p => ({ ...p, rtsp_url_raw: e.target.value }))}
                        placeholder="rtsp://user:pass@ip:554/stream"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <button
                      type="button"
                      className="text-xs text-emerald-700 hover:text-emerald-800"
                      onClick={() => {
                        const parsed = parseRtspUrl(form.rtsp_url_raw)
                        if (parsed.mode !== 'fields') {
                          notify('Cannot switch to simple input for this RTSP URL.', 'warning')
                          return
                        }
                        setForm(p => ({
                          ...p,
                          rtsp_mode: 'fields',
                          rtsp_username: parsed.username,
                          rtsp_password: parsed.password,
                          rtsp_host: parsed.host,
                          rtsp_port: parsed.port,
                          rtsp_path: parsed.path,
                        }))
                      }}
                    >
                      Use simple input
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input
                          type="text"
                          required
                          value={form.rtsp_username}
                          onChange={e => setForm(p => ({ ...p, rtsp_username: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input
                          type="password"
                          required
                          value={form.rtsp_password}
                          onChange={e => setForm(p => ({ ...p, rtsp_password: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                        <input
                          type="text"
                          required
                          value={form.rtsp_host}
                          onChange={e => setForm(p => ({ ...p, rtsp_host: e.target.value }))}
                          placeholder="192.168.1.108"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="65535"
                          value={form.rtsp_port}
                          onChange={e => setForm(p => ({ ...p, rtsp_port: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Stream path: {form.rtsp_path}
                    </div>
                    <div className="text-xs text-gray-500">
                      RTSP preview: {buildRtspPreview({
                        username: form.rtsp_username,
                        password: form.rtsp_password,
                        host: form.rtsp_host,
                        port: form.rtsp_port,
                        path: form.rtsp_path,
                      }) || 'Complete the fields to generate a URL.'}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-emerald-700 hover:text-emerald-800"
                      onClick={() => setForm(p => ({
                        ...p,
                        rtsp_mode: 'raw',
                        rtsp_url_raw: buildRtspUrl({
                          username: p.rtsp_username,
                          password: p.rtsp_password,
                          host: p.rtsp_host,
                          port: p.rtsp_port,
                          path: p.rtsp_path,
                        }),
                      }))}
                    >
                      Edit full RTSP URL
                    </button>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
              </div>
              <div className="flex space-x-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
