import { getSettings, getWatchlist } from './storage'

const FMP_ORIGIN = 'https://financialmodelingprep.com/stable'
const DAY_MS = 24 * 60 * 60 * 1000
const MACRO_KEYWORDS = [
  'cpi', 'inflation', 'pce', 'nonfarm', 'payroll', 'unemployment', 'jobs',
  'fomc', 'federal reserve', 'fed', 'interest rate', 'rate decision',
  'gdp', 'ppi', 'retail sales', 'ism', 'jobless', 'treasury',
  'bank of canada', 'boc', 'oil', 'iran', 'israel', 'tariff',
]

const isoDate = (date) => date.toISOString().slice(0, 10)
const today = () => new Date(new Date().toISOString().slice(0, 10))
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS)
const round = (value, digits = 4) => {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null
}
const first = (...values) => values.find((value) => value != null && value !== '') ?? null
const textIncludes = (text, keywords = MACRO_KEYWORDS) => {
  const lower = String(text || '').toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}
const symbolAliases = (symbols) => new Set(symbols.flatMap((symbol) => {
  const clean = symbol.toUpperCase()
  return [clean, clean.replace(/(:CA|:US)$/i, ''), clean.replace(/\.(NE|TO|V)$/i, '')]
}))
const eventTimestamp = (event) => new Date(event.date || event.publishedAt || event.datetime || 0).getTime()
const eventDirection = (event, now = today()) => eventTimestamp(event) >= now.getTime() ? 'upcoming' : 'recent'

async function fetchFmp(path, params, apiKey) {
  const query = new URLSearchParams({ ...params, apikey: apiKey })
  const response = await fetch(`${FMP_ORIGIN}${path}?${query}`)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || `FMP events request failed (${response.status}).`)
  return Array.isArray(data) ? data : []
}

const normalizeEconomicEvent = (item) => ({
  id: `economic:${first(item.date, item.time)}:${first(item.event, item.name)}`,
  type: 'economic',
  date: first(item.date, item.time),
  direction: eventDirection({ date: first(item.date, item.time) }),
  title: first(item.event, item.name, item.title, 'Economic event'),
  country: first(item.country, item.region),
  impact: first(item.impact, item.importance, item.importanceLevel),
  actual: first(item.actual),
  estimate: first(item.estimate, item.forecast, item.consensus),
  previous: first(item.previous),
  source: 'Financial Modeling Prep',
})

const normalizeEarningsEvent = (item, aliases) => {
  const symbol = String(first(item.symbol, item.ticker, '')).toUpperCase()
  if (!aliases.has(symbol)) return null
  return {
    id: `earnings:${symbol}:${first(item.date, item.fiscalDateEnding)}`,
    type: 'earnings',
    date: first(item.date, item.fiscalDateEnding),
    direction: eventDirection({ date: first(item.date, item.fiscalDateEnding) }),
    symbol,
    title: `${symbol} earnings`,
    time: first(item.time, item.when),
    epsEstimated: round(first(item.epsEstimated, item.epsEstimate)),
    epsActual: round(first(item.eps, item.epsActual)),
    revenueEstimated: round(first(item.revenueEstimated, item.revenueEstimate), 0),
    revenueActual: round(first(item.revenue, item.revenueActual), 0),
    source: 'Financial Modeling Prep',
  }
}

const normalizeNewsEvent = (item, watchAliases, type) => {
  const symbols = String(first(item.symbol, item.symbols, '') || '').split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
  const matchedSymbols = symbols.filter((symbol) => watchAliases.has(symbol) || watchAliases.has(symbol.replace(/\.(NE|TO|V)$/i, '')))
  const title = first(item.title, item.headline, 'Market news')
  if (type === 'market-news' && !textIncludes(title)) return null
  if (type === 'stock-news' && symbols.length && !matchedSymbols.length) return null
  return {
    id: `${type}:${first(item.publishedDate, item.date, item.url, title)}`,
    type,
    date: first(item.publishedDate, item.date),
    direction: 'recent',
    title,
    site: first(item.site, item.publisher),
    url: first(item.url),
    symbols: matchedSymbols.length ? matchedSymbols : symbols,
    source: 'Financial Modeling Prep',
  }
}

export async function buildEventsCalendarExport(symbols = getWatchlist(), { pastDays = 30, futureDays = 31 } = {}) {
  const settings = getSettings()
  const apiKey = settings.fmpApiKey?.trim()
  const now = today()
  const from = isoDate(addDays(now, -pastDays))
  const to = isoDate(addDays(now, futureDays))
  const watchAliases = symbolAliases(symbols)
  const base = {
    generatedAt: new Date().toISOString(),
    source: 'TradeMarker',
    provider: 'Financial Modeling Prep',
    range: { from, to, pastDays, futureDays },
    note: 'Events are reference data only. Verify dates with primary sources before trading.',
    watchlist: symbols,
    events: [],
    errors: [],
  }
  if (!apiKey) {
    return { ...base, status: 'disabled', note: `${base.note} Add an FMP API key in Settings to generate this file.` }
  }

  const [economic, earnings, stockNews, generalNews] = await Promise.all([
    fetchFmp('/economic-calendar', { from, to }, apiKey).catch((error) => ({ error })),
    fetchFmp('/earnings-calendar', { from, to }, apiKey).catch((error) => ({ error })),
    fetchFmp('/news/stock-latest', { symbols: [...watchAliases].slice(0, 80).join(','), limit: '80' }, apiKey).catch((error) => ({ error })),
    fetchFmp('/news/general-latest', { limit: '80' }, apiKey).catch((error) => ({ error })),
  ])

  const collect = (label, value, mapper) => {
    if (value?.error) {
      base.errors.push({ source: label, message: value.error.message })
      return []
    }
    return value.map(mapper).filter(Boolean)
  }

  const events = [
    ...collect('economic-calendar', economic, normalizeEconomicEvent)
      .filter((event) => ['US', 'USA', 'United States', 'CA', 'Canada'].includes(event.country) || textIncludes(event.title)),
    ...collect('earnings-calendar', earnings, (item) => normalizeEarningsEvent(item, watchAliases)),
    ...collect('stock-news', stockNews, (item) => normalizeNewsEvent(item, watchAliases, 'stock-news')),
    ...collect('general-news', generalNews, (item) => normalizeNewsEvent(item, watchAliases, 'market-news')),
  ]

  const unique = new Map()
  events.forEach((event) => {
    if (!event.date) return
    unique.set(event.id, event)
  })
  const sorted = [...unique.values()].sort((a, b) => {
    const distance = Math.abs(eventTimestamp(a) - now.getTime()) - Math.abs(eventTimestamp(b) - now.getTime())
    return distance || eventTimestamp(a) - eventTimestamp(b)
  })
  return {
    ...base,
    status: base.errors.length ? 'partial' : 'ok',
    events: sorted,
    upcoming: sorted.filter((event) => event.direction === 'upcoming'),
    recent: sorted.filter((event) => event.direction === 'recent'),
  }
}
