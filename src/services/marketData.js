import { getSettings } from './storage.js'

const API_BASE = 'https://api.twelvedata.com'
const round = (value) => Number(Number(value).toFixed(2))
const snapshotCache = new Map()
const pendingSnapshots = new Map()

const getApiKey = () => getSettings().twelveDataApiKey?.trim()

export const hasMarketDataApiKey = () => Boolean(getApiKey())

async function request(endpoint, parameters) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Add a Twelve Data API key in Settings to load real market data.')

  const query = new URLSearchParams({ ...parameters, apikey: apiKey })
  const response = await fetch(`${API_BASE}/${endpoint}?${query}`)
  if (!response.ok) throw new Error(`Market data request failed (${response.status}).`)
  const data = await response.json()
  if (data.status === 'error' || data.code) throw new Error(data.message || 'Market data provider returned an error.')
  return data
}

export async function getHistoricalDaily(symbol, options) {
  const { candles } = await getMarketSnapshot(symbol, options)
  return candles
}

export async function getLatestQuote(symbol, options) {
  const { quote } = await getMarketSnapshot(symbol, options)
  return quote
}

export async function getMarketSnapshot(symbol, { force = false } = {}) {
  if (!force && snapshotCache.has(symbol)) return snapshotCache.get(symbol)
  if (pendingSnapshots.has(symbol)) return pendingSnapshots.get(symbol)

  const pending = request('time_series', {
    symbol,
    interval: '1day',
    outputsize: '520',
    adjust: 'splits',
  }).then((data) => {
    if (!Array.isArray(data.values) || data.values.length < 2) throw new Error(`No historical market data found for ${symbol}.`)
    const candles = data.values.map((candle) => ({
      time: candle.datetime.slice(0, 10),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume || 0),
    })).reverse()
    const latest = candles.at(-1)
    const previous = candles.at(-2)
    const change = latest.close - previous.close
    const snapshot = {
      candles,
      quote: {
        symbol,
        name: data.meta?.symbol || symbol,
        exchange: data.meta?.exchange || 'US',
        currency: data.meta?.currency || 'USD',
        price: round(latest.close),
        change: round(change),
        changePercent: round((change / previous.close) * 100),
        asOf: latest.time,
        source: 'Twelve Data',
      },
    }
    snapshotCache.set(symbol, snapshot)
    return snapshot
  }).finally(() => pendingSnapshots.delete(symbol))

  pendingSnapshots.set(symbol, pending)
  return pending
}
