import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Cell,
  LabelList,
} from 'recharts'
import { fetchCollisions, fetchCameras } from '../api'
import useAutoRefresh from '../utils/useAutoRefresh'

const SEVERITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
  unreviewed: '#94a3b8',
}

const STATUS_COLORS = {
  pending: '#f97316',
  acknowledged: '#3b82f6',
  responded: '#8b5cf6',
  resolved: '#10b981',
}

const SMS_STATUS_COLORS = {
  sent: '#16a34a',
  failed: '#ef4444',
  pending: '#f59e0b',
}

const COLLISION_TYPE_LABELS = {
  single_vehicle: 'Single-Vehicle',
  rear_end: 'Rear-End',
  head_on: 'Head-On',
  side_impact: 'Side-Impact',
  multi_vehicle: 'Multi-Vehicle',
  unspecified: 'Unspecified',
}

const COLLISION_TYPE_COLORS = {
  single_vehicle: '#0ea5e9',
  rear_end: '#f97316',
  head_on: '#ef4444',
  side_impact: '#8b5cf6',
  multi_vehicle: '#14b8a6',
  unspecified: '#94a3b8',
}

const RESPONDER_COLORS = ['#0ea5e9', '#6366f1', '#14b8a6', '#f97316', '#a855f7', '#ef4444']

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTH_SHORT_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="relative overflow-hidden bg-white/95 rounded-2xl shadow-sm border border-gray-200 p-5">
      <div className="pointer-events-none absolute -top-16 -right-12 w-36 h-36 rounded-full bg-cyan-100/50 blur-2xl" />
      <div className="mb-4">
        <h3 className="text-base font-semibold tracking-tight text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function ChartSurface({ children, className = '' }) {
  return (
    <div
      className={`h-72 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-inner ${className}`}
    >
      {children}
    </div>
  )
}

function StatCard({ icon, iconBg, iconColor, label, value, hint, hintColor = 'text-gray-500' }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className={`text-sm mt-1 ${hintColor}`}>{hint}</p>
        </div>
        <div className={`p-3 rounded-full ${iconBg}`}>
          <i className={`fas ${icon} text-lg ${iconColor}`} />
        </div>
      </div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, disabled = false, icon }) {
  return (
    <label className={`flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide ${disabled ? 'text-gray-300' : 'text-slate-500'}`}>
      <span className="flex items-center gap-2">
        {icon && <i className={`fas ${icon} text-[11px]`} />}
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-300
          ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-slate-900 border-slate-200 shadow-sm'}`}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function EmptyChart({ message }) {
  return (
    <div className="h-72 flex items-center justify-center text-gray-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-300">
      {message}
    </div>
  )
}

function ModernTooltip({ active, label, payload, labelPrefix = '' }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg">
      {label !== undefined && (
        <p className="text-xs font-semibold text-slate-700">{labelPrefix}{label}</p>
      )}
      <div className="mt-1 space-y-1">
        {payload.map(item => {
          const displayName = label !== undefined ? item.name : (item.payload?.name || item.name)
          return (
            <div key={`${item.name}-${displayName}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600">{displayName}</span>
              <span className="font-semibold text-slate-900">{item.value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderSeverityLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, value, fill }) {
  if (!percent || percent < 0.08) return null

  const RADIAN = Math.PI / 180
  const radius = outerRadius + 18
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill={fill}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${name} ${Math.round(percent * 100)}%`}
    </text>
  )
}

function HotspotAxisTick({ x, y, payload }) {
  const rawLabel = String(payload?.value ?? '')
  if (rawLabel.startsWith('__spacer__')) return null
  const trimmed = rawLabel.length > 18 ? `${rawLabel.slice(0, 18)}…` : rawLabel
  const splitAt = trimmed.lastIndexOf(' ', 10)
  const firstLine = splitAt > 0 ? trimmed.slice(0, splitAt) : trimmed.slice(0, 10)
  const secondLine = splitAt > 0 ? trimmed.slice(splitAt + 1) : trimmed.slice(10)
  const showSecondLine = secondLine && secondLine.length > 0

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#64748b" fontSize={10}>
        <tspan x="0" dy="12">{firstLine}</tspan>
        {showSecondLine && <tspan x="0" dy="12">{secondLine}</tspan>}
      </text>
    </g>
  )
}

function HotspotTooltip(props) {
  if (props?.payload?.[0]?.payload?.isSpacer) return null
  return <ModernTooltip {...props} />
}

function HotspotBarLabel(props) {
  const { x, y, width, value, payload } = props
  if (payload?.isSpacer || !value) return null
  return (
    <text x={x + width / 2} y={y - 6} textAnchor="middle" fill="#0f172a" fontSize={11}>
      {value}
    </text>
  )
}


function normalizeResponderValue(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return ''
  return rawValue.replace(/\s+/g, ' ')
}

function getResponderMeta(collision) {
  const primaryRaw = collision?.resolved_by || collision?.responded_by || collision?.acknowledged_by
  const primary = normalizeResponderValue(primaryRaw)
  const primaryKey = primary ? primary.toLowerCase() : ''

  const candidates = [collision?.acknowledged_by, collision?.responded_by, collision?.resolved_by]
  const keys = []
  const labels = []
  const seen = new Set()

  candidates.forEach(candidate => {
    const normalized = normalizeResponderValue(candidate)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    keys.push(key)
    labels.push(normalized)
  })

  return { primary, primaryKey, keys, labels }
}

function normalizeCollisionTypeKey(value) {
  const rawValue = String(value || '').trim().toLowerCase()
  if (!rawValue) return 'unspecified'

  if (['single-vehicle', 'single vehicle', 'single_vehicle'].includes(rawValue)) return 'single_vehicle'
  if (['rear-end', 'rear end', 'rear_end'].includes(rawValue)) return 'rear_end'
  if (['head-on', 'head on', 'head_on'].includes(rawValue)) return 'head_on'
  if (['side-impact', 'side impact', 'side_impact'].includes(rawValue)) return 'side_impact'
  if (['multi-vehicle', 'multi vehicle', 'multi_vehicle'].includes(rawValue)) return 'multi_vehicle'

  return 'unspecified'
}

function normalizeSeverityKey(value) {
  const rawValue = String(value || '').trim().toLowerCase()
  if (['high', 'medium', 'low'].includes(rawValue)) return rawValue
  return 'unreviewed'
}

export default function Analytics({ notify }) {
  const [collisions, setCollisions] = useState([])
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const defaultYear = String(now.getFullYear())
  const defaultMonth = String(now.getMonth() + 1)

  const [yearFilter, setYearFilter] = useState(defaultYear)
  const [monthFilter, setMonthFilter] = useState(defaultMonth)
  const [dayFilter, setDayFilter] = useState('all')
  const [cameraFilter, setCameraFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [responderFilter, setResponderFilter] = useState('all')

  async function load(options = {}) {
    const background = !!options.background
    try {
      const [collisionDocs, cameraDocs] = await Promise.all([fetchCollisions(), fetchCameras()])
      setCollisions(collisionDocs)
      setCameras(cameraDocs)
    } catch {
      if (!background) notify('Failed to load analytics data.', 'error')
    } finally {
      if (!background) setLoading(false)
    }
  }

  useAutoRefresh(load, { intervalMs: 7000 })

  const normalizedCollisions = useMemo(() => {
    return collisions
      .map(collision => {
        const stamp = new Date(collision.timestamp)
        if (Number.isNaN(stamp.getTime())) return null
        const cameraKey = collision.camera_id || `name:${collision.camera_name || 'unknown'}`
        const responderMeta = getResponderMeta(collision)
        return {
          ...collision,
          _stamp: stamp,
          _year: stamp.getFullYear(),
          _month: stamp.getMonth() + 1,
          _day: stamp.getDate(),
          _hour: stamp.getHours(),
          _cameraKey: cameraKey,
          _responderKeys: responderMeta.keys,
          _responderLabels: responderMeta.labels,
          _primaryResponder: responderMeta.primary,
          _primaryResponderKey: responderMeta.primaryKey,
        }
      })
      .filter(Boolean)
  }, [collisions])

  const availableYears = useMemo(() => {
    const years = new Set()
    normalizedCollisions.forEach(collision => years.add(collision._year))
    if (!years.size) years.add(Number(defaultYear))
    return Array.from(years).sort((a, b) => b - a)
  }, [normalizedCollisions, defaultYear])

  const daysInSelectedMonth = useMemo(() => {
    if (yearFilter === 'all' || monthFilter === 'all') return 31
    const yearValue = Number(yearFilter)
    const monthValue = Number(monthFilter) - 1
    return new Date(yearValue, monthValue + 1, 0).getDate()
  }, [yearFilter, monthFilter])

  const cameraOptions = useMemo(() => {
    const options = new Map()
    cameras.forEach(cam => {
      options.set(cam.id, { value: cam.id, label: cam.name })
    })
    normalizedCollisions.forEach(collision => {
      if (!options.has(collision._cameraKey)) {
        options.set(collision._cameraKey, {
          value: collision._cameraKey,
          label: collision.camera_name || 'Unknown Camera',
        })
      }
    })
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [cameras, normalizedCollisions])

  const responderOptions = useMemo(() => {
    const options = new Map()
    normalizedCollisions.forEach(collision => {
      collision._responderKeys.forEach((key, index) => {
        if (!options.has(key)) {
          const label = collision._responderLabels[index] || key
          options.set(key, { value: key, label })
        }
      })
    })
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [normalizedCollisions])

  const filteredCollisions = useMemo(() => {
    return normalizedCollisions.filter(collision => {
      if (yearFilter !== 'all' && collision._year !== Number(yearFilter)) return false
      if (monthFilter !== 'all' && collision._month !== Number(monthFilter)) return false
      if (dayFilter !== 'all' && collision._day !== Number(dayFilter)) return false
      if (cameraFilter !== 'all' && collision._cameraKey !== cameraFilter) return false

      const statusKey = String(collision.status || 'pending').toLowerCase()
      if (statusFilter !== 'all' && statusKey !== statusFilter) return false

      const severityKey = normalizeSeverityKey(collision.severity)
      if (severityFilter !== 'all' && severityKey !== severityFilter) return false

      const typeKey = normalizeCollisionTypeKey(collision.collision_type)
      if (typeFilter !== 'all' && typeKey !== typeFilter) return false

      if (responderFilter !== 'all') {
        if (responderFilter === 'unassigned') {
          if (collision._responderKeys.length) return false
        } else if (!collision._responderKeys.includes(responderFilter)) {
          return false
        }
      }

      return true
    })
  }, [
    normalizedCollisions,
    yearFilter,
    monthFilter,
    dayFilter,
    cameraFilter,
    statusFilter,
    severityFilter,
    typeFilter,
    responderFilter,
  ])

  useEffect(() => {
    if (yearFilter === 'all') {
      setMonthFilter('all')
      setDayFilter('all')
    }
  }, [yearFilter])

  useEffect(() => {
    if (monthFilter === 'all') {
      setDayFilter('all')
      return
    }

    if (dayFilter !== 'all' && Number(dayFilter) > daysInSelectedMonth) {
      setDayFilter('all')
    }
  }, [monthFilter, dayFilter, daysInSelectedMonth])

  const yearOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All years' },
      ...availableYears.map(year => ({ value: String(year), label: String(year) })),
    ]
  }, [availableYears])

  const monthOptions = useMemo(() => {
    if (yearFilter === 'all') {
      return [{ value: 'all', label: 'All months' }]
    }
    const yearValue = Number(yearFilter)
    const counts = Array.from({ length: 12 }, () => 0)
    normalizedCollisions.forEach(collision => {
      if (collision._year === yearValue) counts[collision._month - 1] += 1
    })
    return [
      { value: 'all', label: 'All months' },
      ...counts.map((count, index) => ({
        value: String(index + 1),
        label: `${MONTH_SHORT_LABELS[index]} (${count})`,
      })),
    ]
  }, [yearFilter, normalizedCollisions])

  const dayOptions = useMemo(() => {
    if (yearFilter === 'all' || monthFilter === 'all') {
      return [{ value: 'all', label: 'All days' }]
    }
    const yearValue = Number(yearFilter)
    const monthValue = Number(monthFilter)
    const counts = Array.from({ length: daysInSelectedMonth }, () => 0)
    normalizedCollisions.forEach(collision => {
      if (collision._year === yearValue && collision._month === monthValue) {
        counts[collision._day - 1] += 1
      }
    })
    return [
      { value: 'all', label: 'All days' },
      ...counts.map((count, index) => ({
        value: String(index + 1),
        label: `Day ${index + 1} (${count})`,
      })),
    ]
  }, [yearFilter, monthFilter, daysInSelectedMonth, normalizedCollisions])

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'acknowledged', label: 'Acknowledged' },
    { value: 'responded', label: 'Responded' },
    { value: 'resolved', label: 'Resolved' },
  ]

  const severityOptions = [
    { value: 'all', label: 'All severities' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'unreviewed', label: 'Unreviewed' },
  ]

  const typeOptions = [
    { value: 'all', label: 'All collision types' },
    { value: 'single_vehicle', label: COLLISION_TYPE_LABELS.single_vehicle },
    { value: 'rear_end', label: COLLISION_TYPE_LABELS.rear_end },
    { value: 'head_on', label: COLLISION_TYPE_LABELS.head_on },
    { value: 'side_impact', label: COLLISION_TYPE_LABELS.side_impact },
    { value: 'multi_vehicle', label: COLLISION_TYPE_LABELS.multi_vehicle },
    { value: 'unspecified', label: COLLISION_TYPE_LABELS.unspecified },
  ]

  const activeFilters = useMemo(() => {
    const chips = []
    if (yearFilter !== 'all') chips.push({ label: 'Year', value: yearFilter })
    if (monthFilter !== 'all') {
      const monthName = MONTH_LABELS[Number(monthFilter) - 1]
      chips.push({ label: 'Month', value: monthName })
    }
    if (dayFilter !== 'all') chips.push({ label: 'Day', value: dayFilter })
    if (cameraFilter !== 'all') {
      const camera = cameraOptions.find(option => option.value === cameraFilter)
      chips.push({ label: 'Camera', value: camera?.label || 'Selected' })
    }
    if (statusFilter !== 'all') chips.push({ label: 'Status', value: statusFilter })
    if (severityFilter !== 'all') chips.push({ label: 'Severity', value: severityFilter })
    if (typeFilter !== 'all') {
      const typeLabel = COLLISION_TYPE_LABELS[typeFilter] || typeFilter
      chips.push({ label: 'Type', value: typeLabel })
    }
    if (responderFilter !== 'all') {
      if (responderFilter === 'unassigned') {
        chips.push({ label: 'Responder', value: 'Unassigned' })
      } else {
        const responder = responderOptions.find(option => option.value === responderFilter)
        chips.push({ label: 'Responder', value: responder?.label || 'Selected' })
      }
    }
    return chips
  }, [
    yearFilter,
    monthFilter,
    dayFilter,
    cameraFilter,
    statusFilter,
    severityFilter,
    typeFilter,
    responderFilter,
    cameraOptions,
    responderOptions,
  ])

  function resetFilters() {
    setYearFilter(defaultYear)
    setMonthFilter(defaultMonth)
    setDayFilter('all')
    setCameraFilter('all')
    setStatusFilter('all')
    setSeverityFilter('all')
    setTypeFilter('all')
    setResponderFilter('all')
  }

  const analytics = useMemo(() => {
    const cameraIndex = new Map(cameras.map(cam => [cam.id, cam]))
    const totalCollisions = filteredCollisions.length

    const isYearAll = yearFilter === 'all'
    const isMonthAll = monthFilter === 'all'
    const isDayAll = dayFilter === 'all'

    const yearValue = isYearAll ? null : Number(yearFilter)
    const monthValue = isMonthAll ? null : Number(monthFilter)

    let rangeLabel = 'All time'
    if (!isYearAll && isMonthAll) {
      rangeLabel = `Year ${yearValue}`
    } else if (!isYearAll && !isMonthAll && isDayAll) {
      rangeLabel = `${MONTH_LABELS[monthValue - 1]} ${yearValue}`
    } else if (!isYearAll && !isMonthAll && !isDayAll) {
      rangeLabel = `${MONTH_LABELS[monthValue - 1]} ${dayFilter}, ${yearValue}`
    }

    let trendUnit = 'day'
    let trendLabel = 'Daily trend'
    let trendLabelPrefix = 'Day '
    let trendData = []

    if (isYearAll) {
      trendUnit = 'year'
      trendLabel = 'Yearly trend'
      trendLabelPrefix = ''
      const years = availableYears.length ? [...availableYears].sort((a, b) => a - b) : [Number(defaultYear)]
      trendData = years.map(year => ({ key: year, label: String(year), collisions: 0 }))
    } else if (isMonthAll) {
      trendUnit = 'month'
      trendLabel = `Monthly trend in ${yearValue}`
      trendLabelPrefix = ''
      trendData = MONTH_SHORT_LABELS.map((label, index) => ({
        key: index + 1,
        label,
        collisions: 0,
      }))
    } else if (isDayAll) {
      trendUnit = 'day'
      trendLabel = `Daily trend in ${MONTH_LABELS[monthValue - 1]} ${yearValue}`
      trendLabelPrefix = 'Day '
      trendData = Array.from({ length: daysInSelectedMonth }, (_, index) => ({
        key: index + 1,
        label: String(index + 1),
        collisions: 0,
      }))
    } else {
      trendUnit = 'hour'
      trendLabel = `Hourly trend for ${MONTH_LABELS[monthValue - 1]} ${dayFilter}, ${yearValue}`
      trendLabelPrefix = ''
      trendData = Array.from({ length: 24 }, (_, index) => ({
        key: index,
        label: `${String(index).padStart(2, '0')}:00`,
        collisions: 0,
      }))
    }

    const trendIndex = new Map(trendData.map((item, index) => [item.key, index]))

    const severityCounts = { high: 0, medium: 0, low: 0, unreviewed: 0 }
    const statusCounts = { pending: 0, acknowledged: 0, responded: 0, resolved: 0 }
    const typeCounts = {
      single_vehicle: 0,
      rear_end: 0,
      head_on: 0,
      side_impact: 0,
      multi_vehicle: 0,
      unspecified: 0,
    }
    const cameraCounts = new Map()
    const responderCounts = new Map()
    let responderTotal = 0
    let unassignedTotal = 0

    filteredCollisions.forEach(collision => {
      const severityKey = normalizeSeverityKey(collision.severity)
      if (severityCounts[severityKey] !== undefined) severityCounts[severityKey] += 1

      const statusKey = String(collision.status || 'pending').toLowerCase()
      if (statusCounts[statusKey] !== undefined) statusCounts[statusKey] += 1

      const typeKey = normalizeCollisionTypeKey(collision.collision_type)
      if (typeCounts[typeKey] !== undefined) typeCounts[typeKey] += 1

      const cameraId = collision.camera_id || collision._cameraKey
      const knownCamera = cameraIndex.get(collision.camera_id || '')
      const cameraName = knownCamera?.name || collision.camera_name || 'Unknown Camera'

      if (!cameraCounts.has(cameraId)) {
        cameraCounts.set(cameraId, { name: cameraName, collisions: 0 })
      }
      cameraCounts.get(cameraId).collisions += 1

      if (collision._primaryResponder) {
        responderTotal += 1
        responderCounts.set(
          collision._primaryResponder,
          (responderCounts.get(collision._primaryResponder) || 0) + 1,
        )
      } else {
        unassignedTotal += 1
      }

      let bucketKey = collision._day
      if (trendUnit === 'month') bucketKey = collision._month
      if (trendUnit === 'year') bucketKey = collision._year
      if (trendUnit === 'hour') bucketKey = collision._hour

      const bucketIndex = trendIndex.get(bucketKey)
      if (bucketIndex !== undefined) {
        trendData[bucketIndex].collisions += 1
      }
    })

    const peakBucket = trendData.reduce(
      (best, item) => (item.collisions > best.collisions ? item : best),
      trendData[0] || { label: 'N/A', collisions: 0 },
    )

    const severityData = [
      { name: 'High', value: severityCounts.high, color: SEVERITY_COLORS.high },
      { name: 'Medium', value: severityCounts.medium, color: SEVERITY_COLORS.medium },
      { name: 'Low', value: severityCounts.low, color: SEVERITY_COLORS.low },
      { name: 'Unreviewed', value: severityCounts.unreviewed, color: SEVERITY_COLORS.unreviewed },
    ].filter(item => item.value > 0)

    const severityTotal = severityData.reduce((sum, item) => sum + item.value, 0)

    const typeData = Object.keys(typeCounts)
      .map(key => ({
        key,
        name: COLLISION_TYPE_LABELS[key] || 'Unspecified',
        count: typeCounts[key],
        color: COLLISION_TYPE_COLORS[key] || COLLISION_TYPE_COLORS.unspecified,
      }))
      .filter(item => item.count > 0)

    const typeTotal = typeData.reduce((sum, item) => sum + item.count, 0)

    const statusData = [
      { name: 'Pending', count: statusCounts.pending, color: STATUS_COLORS.pending },
      { name: 'Acknowledged', count: statusCounts.acknowledged, color: STATUS_COLORS.acknowledged },
      { name: 'Responded', count: statusCounts.responded, color: STATUS_COLORS.responded },
      { name: 'Resolved', count: statusCounts.resolved, color: STATUS_COLORS.resolved },
    ]

    const statusTotal = statusData.reduce((sum, item) => sum + item.count, 0)
    const statusMax = Math.max(...statusData.map(item => item.count), 1)

    const topCameraData = Array.from(cameraCounts.values())
      .sort((a, b) => b.collisions - a.collisions)
      .slice(0, 5)

    const hotspotChartData = topCameraData.length
      ? [
        { name: '__spacer__left', collisions: 0, isSpacer: true },
        ...topCameraData,
        { name: '__spacer__right', collisions: 0, isSpacer: true },
      ]
      : []

    const responderData = Array.from(responderCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((item, index) => ({
        ...item,
        color: RESPONDER_COLORS[index % RESPONDER_COLORS.length],
      }))

    const averagePerUnit = trendData.length
      ? (totalCollisions / trendData.length).toFixed(2)
      : '0.00'

    const responderCoverage = totalCollisions
      ? Math.round((responderTotal / totalCollisions) * 100)
      : 0

    const peakLabel = peakBucket.collisions ? peakBucket.label : 'N/A'
    const peakHint = peakBucket.collisions ? `${peakBucket.collisions} incident(s)` : 'No incidents'

    const topCameraEntry = topCameraData[0] || { name: 'N/A', collisions: 0 }

    return {
      rangeLabel,
      trendLabel,
      trendLabelPrefix,
      trendUnit,
      totalCollisions,
      averagePerUnit,
      peakLabel,
      peakHint,
      highSeverity: severityCounts.high,
      trendData,
      severityData,
      severityTotal,
      typeData,
      typeTotal,
      statusData,
      statusTotal,
      statusMax,
      topCameraData,
      hotspotChartData,
      topCameraName: topCameraEntry.name || 'N/A',
      topCameraCount: Number(topCameraEntry.collisions) || 0,
      responderData,
      responderTotal,
      unassignedTotal,
      responderCoverage,
    }
  }, [
    cameras,
    filteredCollisions,
    yearFilter,
    monthFilter,
    dayFilter,
    availableYears,
    daysInSelectedMonth,
    defaultYear,
  ])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="fas fa-spinner fa-spin text-emerald-500 text-3xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 analytics-font">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-6 shadow-sm">
        <div className="pointer-events-none absolute -top-24 -left-20 h-48 w-48 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-14 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">Analytics Filters</p>
              <h2 className="text-xl font-semibold text-slate-900 mt-1">Refine incident insights</h2>
              <p className="text-sm text-slate-500 mt-1">Filter by time, camera, severity, responder, and response state.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-500">Matching incidents</p>
                <p className="text-lg font-semibold text-slate-900">{analytics.totalCollisions}</p>
              </div>
              <button
                onClick={resetFilters}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:border-cyan-300 hover:text-cyan-700 transition"
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <FilterSelect
              label="Year"
              icon="fa-calendar"
              value={yearFilter}
              onChange={setYearFilter}
              options={yearOptions}
            />
            <FilterSelect
              label="Month"
              icon="fa-calendar-alt"
              value={monthFilter}
              onChange={setMonthFilter}
              disabled={yearFilter === 'all'}
              options={monthOptions}
            />
            <FilterSelect
              label="Day"
              icon="fa-calendar-day"
              value={dayFilter}
              onChange={setDayFilter}
              disabled={yearFilter === 'all' || monthFilter === 'all'}
              options={dayOptions}
            />
            <FilterSelect
              label="Camera"
              icon="fa-video"
              value={cameraFilter}
              onChange={setCameraFilter}
              options={[{ value: 'all', label: 'All cameras' }, ...cameraOptions]}
            />
            <FilterSelect
              label="Status"
              icon="fa-flag"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />
            <FilterSelect
              label="Severity"
              icon="fa-exclamation-triangle"
              value={severityFilter}
              onChange={setSeverityFilter}
              options={severityOptions}
            />
            <FilterSelect
              label="Collision Type"
              icon="fa-layer-group"
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
            />
            <FilterSelect
              label="Responder"
              icon="fa-user"
              value={responderFilter}
              onChange={setResponderFilter}
              options={[
                { value: 'all', label: 'All responders' },
                { value: 'unassigned', label: 'Unassigned' },
                ...responderOptions,
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilters.length === 0 ? (
              <span className="text-xs text-slate-500">Showing default view for {analytics.rangeLabel}.</span>
            ) : (
              activeFilters.map(filterItem => (
                <span
                  key={`${filterItem.label}-${filterItem.value}`}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-white/80 px-3 py-1 text-xs text-slate-700 shadow-sm"
                >
                  <span className="text-slate-500">{filterItem.label}</span>
                  <span className="font-semibold text-slate-900">{filterItem.value}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          icon="fa-car-crash"
          iconBg="bg-red-50"
          iconColor="text-red-600"
          label={`Incidents in ${analytics.rangeLabel}`}
          value={analytics.totalCollisions}
          hint="Total collisions in the current filters"
          hintColor="text-red-600"
        />
        <StatCard
          icon="fa-chart-line"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label={`Avg per ${analytics.trendUnit}`}
          value={analytics.averagePerUnit}
          hint={`Average incidents per ${analytics.trendUnit}`}
          hintColor="text-blue-600"
        />
        <StatCard
          icon="fa-fire"
          iconBg="bg-orange-50"
          iconColor="text-orange-600"
          label={`Peak ${analytics.trendUnit}`}
          value={analytics.peakLabel}
          hint={analytics.peakHint}
          hintColor="text-orange-600"
        />
        <StatCard
          icon="fa-exclamation-triangle"
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
          label="High Severity"
          value={analytics.highSeverity}
          hint={`Critical incidents in ${analytics.rangeLabel}`}
          hintColor="text-rose-600"
        />
        <StatCard
          icon="fa-user-check"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          label="Responder Coverage"
          value={`${analytics.responderCoverage}%`}
          hint={analytics.totalCollisions
            ? `${analytics.responderTotal} assigned / ${analytics.totalCollisions}`
            : 'No incidents yet'}
          hintColor="text-emerald-600"
        />
        <StatCard
          icon="fa-map-marker-alt"
          iconBg="bg-cyan-50"
          iconColor="text-cyan-600"
          label="Top Hotspot"
          value={analytics.topCameraCount}
          hint={analytics.topCameraName}
          hintColor="text-cyan-600"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard
          title="Incident Trend"
          subtitle={analytics.trendLabel}
        >
          {analytics.totalCollisions === 0 ? (
            <EmptyChart message="No collisions recorded for the selected filters yet." />
          ) : (
            <ChartSurface>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyCollisionFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
                      <stop offset="70%" stopColor="#f43f5e" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ModernTooltip labelPrefix={analytics.trendLabelPrefix} />} />
                  <Area
                    type="monotone"
                    dataKey="collisions"
                    stroke="#e11d48"
                    strokeWidth={2.5}
                    fill="url(#dailyCollisionFill)"
                    dot={{ r: 2.5, fill: '#e11d48', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 4.5, fill: '#be123c', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSurface>
          )}
        </ChartCard>

        <ChartCard
          title="Severity Distribution"
          subtitle={`How severe incidents were in ${analytics.rangeLabel}`}
        >
          {analytics.severityData.length === 0 ? (
            <EmptyChart message="Severity chart will appear once collisions are recorded." />
          ) : (
            <ChartSurface className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-6 rounded-full bg-gradient-to-br from-white via-slate-50 to-slate-200" />
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                    <defs>
                      <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.22" />
                      </filter>
                    </defs>
                    <Pie
                      data={[{ name: 'base', value: 1 }]}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={110}
                      fill="#e2e8f0"
                      stroke="none"
                    />
                    <Pie
                      data={analytics.severityData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={64}
                      outerRadius={110}
                      paddingAngle={3}
                      cornerRadius={8}
                      stroke="#fff"
                      strokeWidth={2}
                      labelLine={false}
                      label={renderSeverityLabel}
                      style={{ filter: 'url(#pieShadow)' }}
                    >
                      {analytics.severityData.map(item => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ModernTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-2 text-center shadow-sm">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Total</p>
                    <p className="text-2xl font-bold text-slate-900 leading-none mt-1">{analytics.severityTotal}</p>
                    <p className="text-[11px] text-slate-500 mt-1">Incidents</p>
                  </div>
                </div>

                <div className="absolute left-0 right-0 bottom-0 flex flex-wrap items-center justify-center gap-2">
                  {analytics.severityData.map(item => (
                    <div key={item.name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-medium">{item.name}</span>
                      <span className="text-slate-500">{item.value}</span>
                      <span className="text-slate-400">
                        {Math.round((item.value / analytics.severityTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartSurface>
          )}
        </ChartCard>

        <ChartCard
          title="Collision Type Breakdown"
          subtitle={`Classification of incidents in ${analytics.rangeLabel}`}
        >
          {analytics.typeTotal === 0 ? (
            <EmptyChart message="Collision type chart appears once clips are reviewed." />
          ) : (
            <ChartSurface>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.typeData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 20, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ModernTooltip />} />
                  <Bar dataKey="count" radius={[0, 12, 12, 0]} barSize={18} minPointSize={6}>
                    {analytics.typeData.map(item => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                    <LabelList dataKey="count" position="right" fill="#0f172a" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSurface>
          )}
        </ChartCard>

        <ChartCard
          title="Top Camera Hotspots"
          subtitle={`Cameras with the highest incident count in ${analytics.rangeLabel}`}
        >
          {analytics.topCameraData.length === 0 ? (
            <EmptyChart message="No hotspot data yet for the selected filters." />
          ) : (
            <ChartSurface>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.hotspotChartData}
                  margin={{ top: 20, right: 16, left: 16, bottom: 32 }}
                  barCategoryGap="28%"
                  barGap={4}
                >
                  <defs>
                    <linearGradient id="hotspotBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={<HotspotAxisTick />}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={52}
                    padding={{ left: 16, right: 16 }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<HotspotTooltip />} />
                  <Bar dataKey="collisions" radius={[12, 12, 0, 0]} barSize={28} minPointSize={6}>
                    {analytics.hotspotChartData.map(item => (
                      <Cell key={item.name} fill={item.isSpacer ? 'transparent' : 'url(#hotspotBar)'} />
                    ))}
                    <LabelList dataKey="collisions" content={<HotspotBarLabel />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSurface>
          )}
        </ChartCard>

        <ChartCard
          title="Responder Activity"
          subtitle={`Assignments in ${analytics.rangeLabel} (${analytics.responderCoverage}% covered)`}
        >
          {analytics.responderData.length === 0 ? (
            <EmptyChart message="Responder activity appears once incidents are assigned." />
          ) : (
            <ChartSurface>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.responderData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 20, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="2 6" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ModernTooltip />} />
                  <Bar dataKey="count" radius={[0, 12, 12, 0]} barSize={18} minPointSize={6}>
                    {analytics.responderData.map(item => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                    <LabelList dataKey="count" position="right" fill="#0f172a" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSurface>
          )}
        </ChartCard>

        <ChartCard
          title="Incident Status"
          subtitle={`Current response state for ${analytics.rangeLabel}`}
        >
          {analytics.totalCollisions === 0 ? (
            <EmptyChart message="Status distribution appears once incidents exist." />
          ) : (
            <ChartSurface className="flex flex-col gap-3">
              <div className="relative flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    data={analytics.statusData}
                    innerRadius="58%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                  >
                    <PolarAngleAxis type="number" domain={[0, analytics.statusMax]} tick={false} />
                    <RadialBar dataKey="count" background={{ fill: '#e2e8f0' }} cornerRadius={10}>
                      {analytics.statusData.map(item => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </RadialBar>
                    <Tooltip content={<ModernTooltip />} />
                  </RadialBarChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-1.5 text-center shadow-sm">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Total</p>
                    <p className="text-xl font-bold text-slate-900 leading-none mt-0.5">{analytics.statusTotal}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Incidents</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {analytics.statusData.map(item => (
                  <div key={item.name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-xs text-slate-700 shadow-sm">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium">{item.name}</span>
                    <span className="text-slate-500">{item.count}</span>
                  </div>
                ))}
              </div>
            </ChartSurface>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
