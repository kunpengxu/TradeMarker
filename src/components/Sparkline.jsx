import { useMemo } from 'react'

const pointsFrom = (rows) => rows
  .map((row) => Number(row.close))
  .filter(Number.isFinite)

export default function Sparkline({ rows = [], fallbackRows = [], change = 0 }) {
  const values = useMemo(() => {
    const intraday = pointsFrom(rows)
    return intraday.length > 1 ? intraday : pointsFrom(fallbackRows).slice(-36)
  }, [rows, fallbackRows])

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
