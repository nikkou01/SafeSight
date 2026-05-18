export function parseApiDate(value) {
  if (!value) return null

  const raw = String(value).trim()
  if (!raw) return null

  const hasTimezone = /([zZ]|[+\-]\d{2}:\d{2})$/.test(raw)
  let date = new Date(raw)

  if (!hasTimezone && Number.isNaN(date.getTime())) {
    date = new Date(`${raw}Z`)
  }

  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatApiDateTime(value) {
  const date = parseApiDate(value)
  if (!date) return 'N/A'
  const formatted = date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return formatted.replace(/\s(AM|PM)$/, '$1')
}
