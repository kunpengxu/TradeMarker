import { getSettings } from './storage.js'

const round = (value) => Number(Number(value).toFixed(2))
const snapshotCache = new Map()
const pendingSnapshots = new Map()
const DEFAULT_YAHOO_PROXY = 'https://trademarker-yahoo-proxy.kunp-xu.workers.dev'
const REGULAR_SESSION_START = 9 * 60 + 30
const REGULAR_SESSION_END = 16 * 60 + 30

const yahooUrls = (path) => {
  const customProxy = getSettings().yahooProxyUrl?.trim().replace(/\/$/, '')
  const proxies = [...new Set([customProxy, DEFAULT_YAHOO_PROXY].filter(Boolean))]
  const urls = proxies.map((proxy) => `${proxy}${path}`)
  if (import.meta.env.DEV) urls.push(`/api/yahoo${path}`, `/api/yahoo2${path}`)
  return urls
}

const providerConfig = () => {
  const settings = getSettings()
  const provider = settings.marketDataProviderChosen ? settings.marketDataProvider : 'yahoo'
  return {
    provider,
    apiKey: provider === 'fmp' ? settings.fmpApiKey?.trim() : settings.twelveDataApiKey?.trim(),
  }
}

export const getMarketDataProviderName = () => ({
  yahoo: 'Yahoo Finance',
  fmp: 'Financial Modeling Prep',
  twelveData: 'Twelve Data',
})[providerConfig().provider]

export const hasMarketDataApiKey = () => providerConfig().provider === 'yahoo' || Boolean(providerConfig().apiKey)

async function fetchJson(url) {
  let response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('Yahoo Finance could not be reached through the configured proxy.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.chart?.error?.description || data?.finance?.error?.description || data?.['Error Message'] || data?.message
    throw new Error(detail || `Market data request failed (${response.status}).`)
  }
  return data
}

async function fetchYahooJson(path) {
  const errors = []
  for (const url of yahooUrls(path)) {
    try {
      return await fetchJson(url)
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.some((error) => error.message.includes('429'))) {
    throw new Error('Yahoo Finance rate-limited the proxy and public endpoints (429). Wait before retrying or select another provider in Settings.')
  }
  throw errors[0] || new Error('Yahoo Finance could not be reached.')
}

const marketMinute = (timestamp) => {
  const date = new Date(timestamp * 1000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return {
    key: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function cleanIntradayCandles(candles) {
  const valid = candles
    .map((candle) => ({ ...candle, close: Number(candle.close), meta: marketMinute(candle.time) }))
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0 && candle.meta.minutes >= REGULAR_SESSION_START && candle.meta.minutes <= REGULAR_SESSION_END)
  const latestDay = valid.at(-1)?.meta.day
  if (!latestDay) return []
  const sameDay = valid.filter((candle) => candle.meta.day === latestDay)
  const midpoint = median(sameDay.map((candle) => candle.close))
  const byMinute = new Map()
  sameDay
    .filter((candle) => candle.close >= midpoint * 0.55 && candle.close <= midpoint * 1.45)
    .forEach((candle) => byMinute.set(candle.meta.key, candle))
  return [...byMinute.values()]
    .sort((a, b) => a.time - b.time)
    .map(({ meta, ...candle }) => {
      const close = Number(candle.close)
      return {
        ...candle,
        open: Number.isFinite(candle.open) && candle.open > 0 ? candle.open : close,
        high: Number.isFinite(candle.high) && candle.high > 0 ? candle.high : close,
        low: Number.isFinite(candle.low) && candle.low > 0 ? candle.low : close,
        close,
      }
    })
}

export async function searchSymbols(query) {
  const clean = query.trim()
  if (clean.length < 2) return []
  const params = new URLSearchParams({ q: clean, quotesCount: '20', newsCount: '0', enableFuzzyQuery: 'true' })
  const data = await fetchYahooJson(`/v1/finance/search?${params}`)
  return (data.quotes || []).filter((item) => item.symbol && ['EQUITY', 'ETF'].includes(item.quoteType)).map((item) => ({
    symbol: item.symbol,
    name: item.shortname || item.longname || item.symbol,
    exchange: item.exchDisp || item.exchange || 'Unknown',
    type: item.typeDisp || item.quoteType,
  }))
}

async function fetchYahooSnapshot(symbol) {
  const yahooSymbol = symbol.endsWith(':CA') ? `${symbol.slice(0, -3)}.NE` : symbol.endsWith(':US') ? symbol.slice(0, -3) : symbol
  const params = new URLSearchParams({ interval: '1d', range: '2y', events: 'history', includeAdjustedClose: 'true' })
  const data = await fetchYahooJson(`/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}`)
  const result = data.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  if (!result || !quote || !Array.isArray(result.timestamp)) throw new Error(`No Yahoo Finance market data found for ${symbol}.`)

  const candles = result.timestamp.map((timestamp, index) => ({
    time: new Date(timestamp * 1000).toISOString().slice(0, 10),
    open: Number(quote.open[index]),
    high: Number(quote.high[index]),
    low: Number(quote.low[index]),
    close: Number(quote.close[index]),
    volume: Number(quote.volume[index] || 0),
  })).filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))

  if (candles.length < 2) throw new Error(`Yahoo Finance returned insufficient OHLC data for ${symbol}.`)
  return createSnapshot(symbol, candles, {
    exchange: result.meta.exchangeName || result.meta.exchange || 'Unknown',
    currency: result.meta.currency || 'USD',
    source: 'Yahoo Finance',
    closeOnly: false,
  })
}

export async function getIntradayCandles(symbol) {
  const { provider } = providerConfig()
  if (provider !== 'yahoo') return []
  const yahooSymbol = symbol.endsWith(':CA') ? `${symbol.slice(0, -3)}.NE` : symbol.endsWith(':US') ? symbol.slice(0, -3) : symbol
  const params = new URLSearchParams({ interval: '1m', range: '1d', includePrePost: 'false' })
  const data = await fetchYahooJson(`/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${params}`)
  const result = data.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  const candles = result?.timestamp?.map((timestamp, index) => ({
    time: timestamp,
    open: Number(quote.open[index]),
    high: Number(quote.high[index]),
    low: Number(quote.low[index]),
    close: Number(quote.close[index]),
    volume: Number(quote.volume[index] || 0),
  })).filter((candle) => Number.isFinite(candle.close)) || []
  return cleanIntradayCandles(candles)
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
    return { time: candle.date.slice(0, 10), open: Number(candle.open ?? close), high: Number(candle.high ?? close), low: Number(candle.low ?? close), close, volume: Number(candle.volume || 0) }
  }).filter((candle) => Number.isFinite(candle.close)).sort((a, b) => a.time.localeCompare(b.time))
  return createSnapshot(symbol, candles, { exchange: 'US', currency: 'USD', source: 'FMP', closeOnly })
}

async function fetchTwelveDataSnapshot(symbol, apiKey) {
  const query = new URLSearchParams({ symbol, interval: '1day', outputsize: '520', adjust: 'splits', apikey: apiKey })
  const data = await fetchJson(`https://api.twelvedata.com/time_series?${query}`)
  if (data.status === 'error' || data.code) throw new Error(data.message || 'Twelve Data returned an error.')
  if (!Array.isArray(data.values) || data.values.length < 2) throw new Error(`No Twelve Data market data found for ${symbol}.`)
  const candles = data.values.map((candle) => ({ time: candle.datetime.slice(0, 10), open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close), volume: Number(candle.volume || 0) })).reverse()
  return createSnapshot(symbol, candles, { exchange: data.meta?.exchange || 'Unknown', currency: data.meta?.currency || 'USD', source: 'Twelve Data', closeOnly: false })
}

function createSnapshot(symbol, candles, metadata) {
  const latest = candles.at(-1)
  const previous = candles.at(-2)
  const change = latest.close - previous.close
  return { candles, intradayCandles: [], quote: { symbol, exchange: metadata.exchange, currency: metadata.currency, price: round(latest.close), change: round(change), changePercent: round((change / previous.close) * 100), asOf: latest.time, source: metadata.source, closeOnly: metadata.closeOnly } }
}

export async function getMarketSnapshot(symbol, { force = false } = {}) {
  const { provider, apiKey } = providerConfig()
  if (provider !== 'yahoo' && !apiKey) throw new Error(`Add a ${getMarketDataProviderName()} API key in Settings to load market data.`)
  const cacheKey = `${provider}:${symbol}`
  if (!force && snapshotCache.has(cacheKey)) return snapshotCache.get(cacheKey)
  if (pendingSnapshots.has(cacheKey)) return pendingSnapshots.get(cacheKey)
  const fetcher = provider === 'yahoo' ? fetchYahooSnapshot(symbol) : provider === 'fmp' ? fetchFmpSnapshot(symbol, apiKey) : fetchTwelveDataSnapshot(symbol, apiKey)
  const pending = fetcher.then((snapshot) => { snapshotCache.set(cacheKey, snapshot); return snapshot }).finally(() => pendingSnapshots.delete(cacheKey))
  pendingSnapshots.set(cacheKey, pending)
  return pending
}
