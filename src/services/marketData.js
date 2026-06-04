const hashSymbol = (symbol) => [...symbol].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0)
const seededRandom = (seed) => {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}
const round = (value) => Number(value.toFixed(2))

export async function getHistoricalDaily(symbol) {
  const random = seededRandom(hashSymbol(symbol))
  let price = 12 + random() * 180
  const candles = []
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - 520)

  while (date <= new Date()) {
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      const open = price * (1 + (random() - 0.5) * 0.025)
      const close = open * (1 + (random() - 0.48) * 0.05)
      const high = Math.max(open, close) * (1 + random() * 0.02)
      const low = Math.min(open, close) * (1 - random() * 0.02)
      price = Math.max(1, close)
      candles.push({
        time: date.toISOString().slice(0, 10),
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(price),
        volume: Math.floor(100000 + random() * 9900000),
      })
    }
    date.setDate(date.getDate() + 1)
  }
  return Promise.resolve(candles)
}

export async function getLatestQuote(symbol) {
  const history = await getHistoricalDaily(symbol)
  const latest = history.at(-1)
  const previous = history.at(-2)
  const change = round(latest.close - previous.close)
  return {
    symbol,
    price: latest.close,
    change,
    changePercent: round((change / previous.close) * 100),
    asOf: new Date().toISOString(),
  }
}
