const keyFor = (date, interval) => {
  const d = new Date(`${date}T00:00:00`)
  const year = d.getFullYear()
  if (interval === 'yearly') return `${year}`
  if (interval === 'quarterly') return `${year}-Q${Math.floor(d.getMonth() / 3) + 1}`
  if (interval === 'monthly') return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return monday.toISOString().slice(0, 10)
}

export function resampleCandles(daily, interval) {
  if (interval === 'daily') return daily
  const groups = new Map()
  daily.forEach((candle) => {
    const key = keyFor(candle.time, interval)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { ...candle })
    } else {
      group.high = Math.max(group.high, candle.high)
      group.low = Math.min(group.low, candle.low)
      group.close = candle.close
      group.volume += candle.volume
    }
  })
  return [...groups.values()]
}
