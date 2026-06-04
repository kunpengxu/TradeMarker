import { getSettings } from './storage.js'

const round = (value) => Number(Number(value).toFixed(2))
const snapshotCache = new Map()
const pendingSnapshots = new Map()

const providerConfig = () => {
  const settings = getSettings()
  const provider = settings.marketDataProvider || 'fmp'
  return {
    provider,
    apiKey: provider === 'fmp' ? settings.fmpApiKey?.trim() : settings.twelveDataApiKey?.trim(),
  }
}

export const getMarketDataProviderName = () => providerConfig().provider === 'fmp'
  ? 'Financial Modeling Prep'
  : 'Twelve Data'

export const hasMarketDataApiKey = () => Boolean(providerConfig().apiKey)

async function fetchJson(url) {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.['Error Message'] || data?.message
    throw new Error(detail || `Market data request failed (${response.status}).`)
  }
  return data
}

async function fetchFmpSnapshot(symbol, apiKey) {
  const query = new URLSearchParams({ symbol, apikey: apiKey })
  const data = await fetchJson(`https://financialmodelingprep.com/stable/historical-price-eod/light?${query}`)
  if (!Array.isArray(data) || data.length < 2) throw new Error(`No FMP end-of-day data found for ${symbol}.`)

  let closeOnly = false
  const candles = data.slice(0, 520).map((candle) => {
    const close = Number(candle.close ?? candle.price ?? candle.adjClose)
    const hasOhlc = candle.open != null && candle.high != null && candle.low != null
    if (!hasOhlc) closeOnly = true
    return {
    time: candle.date.slice(0, 10),
    open: Number(candle.open ?? close),
    high: Number(candle.high ?? close),
    low: Number(candle.low ?? close),
    close,
    volume: Number(candle.volume || 0),
  }}).filter((candle) => Number.isFinite(candle.close)).sort((a, b) => a.time.localeCompare(b.time))
  if (candles.length < 2) throw new Error(`FMP returned insufficient end-of-day data for ${symbol}.`)
  return createSnapshot(symbol, candles, {
    exchange: 'US',
    currency: 'USD',
    source: 'FMP',
    closeOnly,
  })
}

async function fetchTwelveDataSnapshot(symbol, apiKey) {
  const query = new URLSearchParams({
    symbol,
    interval: '1day',
    outputsize: '520',
    adjust: 'splits',
    apikey: apiKey,
  })
  const data = await fetchJson(`https://api.twelvedata.com/time_series?${query}`)
  if (data.status === 'error' || data.code) throw new Error(data.message || 'Twelve Data returned an error.')
  if (!Array.isArray(data.values) || data.values.length < 2) throw new Error(`No Twelve Data market data found for ${symbol}.`)

  const candles = data.values.map((candle) => ({
    time: candle.datetime.slice(0, 10),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume || 0),
  })).reverse()
  return createSnapshot(symbol, candles, {
    exchange: data.meta?.exchange || 'US',
    currency: data.meta?.currency || 'USD',
    source: 'Twelve Data',
    closeOnly: false,
  })
}

function createSnapshot(symbol, candles, metadata) {
  const latest = candles.at(-1)
  const previous = candles.at(-2)
  const change = latest.close - previous.close
  return {
    candles,
    quote: {
      symbol,
      exchange: metadata.exchange,
      currency: metadata.currency,
      price: round(latest.close),
      change: round(change),
      changePercent: round((change / previous.close) * 100),
      asOf: latest.time,
      source: metadata.source,
      closeOnly: metadata.closeOnly,
    },
  }
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
  const { provider, apiKey } = providerConfig()
  if (!apiKey) throw new Error(`Add a ${getMarketDataProviderName()} API key in Settings to load market data.`)
  const cacheKey = `${provider}:${symbol}`
  if (!force && snapshotCache.has(cacheKey)) return snapshotCache.get(cacheKey)
  if (pendingSnapshots.has(cacheKey)) return pendingSnapshots.get(cacheKey)

  const pending = (provider === 'fmp' ? fetchFmpWithFallback(symbol, apiKey) : fetchTwelveDataSnapshot(symbol, apiKey))
    .then((snapshot) => {
      snapshotCache.set(cacheKey, snapshot)
      return snapshot
    })
    .finally(() => pendingSnapshots.delete(cacheKey))

  pendingSnapshots.set(cacheKey, pending)
  return pending
}

async function fetchFmpWithFallback(symbol, apiKey) {
  try {
    return await fetchFmpSnapshot(symbol, apiKey)
  } catch (fmpError) {
    const twelveDataKey = getSettings().twelveDataApiKey?.trim()
    if (!twelveDataKey) {
      throw new Error(`${fmpError.message} Add a Twelve Data key in Settings to use it as fallback for symbols outside FMP free coverage.`)
    }
    try {
      const snapshot = await fetchTwelveDataSnapshot(symbol, twelveDataKey)
      snapshot.quote.source = 'Twelve Data fallback'
      return snapshot
    } catch {
      throw fmpError
    }
  }
}
