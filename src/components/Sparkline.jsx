import { useMemo } from 'react'

const marketMinute = (time) => {
  const date = typeof time === 'number' ? new Date(time * 1000) : new Date(time)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  const minutes = Number(parts.hour) * 60 + Number(parts.minute)
  return { key: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`, day: `${parts.year}-${parts.month}-${parts.day}`, minutes }
}

const sessionValues = (rows) => {
  const cleaned = rows
    .map((row) => ({ meta: marketMinute(row.time), close: Number(row.close) }))
    .filter((row) => row.meta && Number.isFinite(row.close) && row.close > 0)
  const latestDay = cleaned.at(-1)?.meta.day
  if (!latestDay) return []
  const byMinute = new Map()
  cleaned
    .filter((row) => row.meta.day === latestDay && row.meta.minutes >= 570 && row.meta.minutes <= 990)
    .forEach((row) => byMinute.set(row.meta.key, row))
  return [...byMinute.values()]
    .sort((a, b) => a.meta.minutes - b.meta.minutes)
    .map((row) => row.close)
}

export default function Sparkline({ rows = [], change = 0 }) {
  const values = useMemo(() => {
    const intraday = sessionValues(rows)
    return intraday.length > 180 ? intraday.filter((_, index) => index % Math.ceil(intraday.length / 180) === 0) : intraday
  }, [rows])

  if (values.length < 2) return <span className="watch-sparkline empty" />

  const width = 86
  const height = 36
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const path = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 4) - 2
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const area = `${path} L${width},${height} L0,${height} Z`
  const positive = change >= 0 || values.at(-1) >= values[0]

  return <svg className={`watch-sparkline ${positive ? 'positive' : 'negative'}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <path className="spark-area" d={area} />
    <path className="spark-line" d={path} />
  </svg>
}
