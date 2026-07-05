import { getSettings, getWatchlist } from './storage'

const FMP_ORIGIN = 'https://financialmodelingprep.com/stable'
const MARKETAUX_ORIGIN = 'https://api.marketaux.com/v1'
const DEFAULT_YAHOO_PROXY = 'https://trademarker-yahoo-proxy.kunp-xu.workers.dev'
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
const isMacroEvent = (event) => event.type === 'economic' || event.type === 'market-news'
const scoreEventImpact = (event, watchAliases, now = today()) => {
  let score = 10
  const text = `${event.title || ''} ${event.description || ''} ${event.impact || ''}`.toLowerCase()
  const symbols = event.symbol ? [event.symbol] : event.symbols || []
  if (symbols.some((symbol) => watchAliases.has(String(symbol).toUpperCase()) || watchAliases.has(String(symbol).replace(/\.(NE|TO|V)$/i, '').toUpperCase()))) score += 30
  if (event.type === 'earnings') score += 25
  if (event.type === 'economic') score += String(event.impact || '').toLowerCase().includes('high') ? 28 : 18
  if (event.type === 'stock-news') score += 16
  if (event.type === 'market-news' && textIncludes(text)) score += 18
  if (['fomc', 'inflation', 'cpi', 'earnings', 'guidance', 'tariff', 'oil', 'rate', 'fed'].some((keyword) => text.includes(keyword))) score += 10
  const daysAway = Math.abs((eventTimestamp(event) - now.getTime()) / DAY_MS)
  if (daysAway <= 2) score += 14
  else if (daysAway <= 7) score += 8
  if (event.sentiment != null && Math.abs(Number(event.sentiment)) > 0.3) score += 8
  return Math.max(0, Math.min(100, Math.round(score)))
}
const yahooProxyUrls = (path) => {
  const customProxy = getSettings().yahooProxyUrl?.trim().replace(/\/$/, '')
  return [...new Set([customProxy, DEFAULT_YAHOO_PROXY].filter(Boolean))].map((proxy) => `${proxy}${path}`)
}

async function fetchFmp(path, params, apiKey) {
  const query = new URLSearchParams({ ...params, apikey: apiKey })
  const response = await fetch(`${FMP_ORIGIN}${path}?${query}`)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || data?.['Error Message'] || `FMP events request failed (${response.status}).`)
  return Array.isArray(data) ? data : []
}

async function fetchMarketauxNews(params, apiKey) {
  const query = new URLSearchParams({ language: 'en', limit: '3', ...params, api_token: apiKey })
  const response = await fetch(`${MARKETAUX_ORIGIN}/news/all?${query}`)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `Marketaux request failed (${response.status}).`)
  return Array.isArray(data?.data) ? data.data : []
}

async function fetchYahooFinanceNews(query, count = 8) {
  const params = new URLSearchParams({ q: query, quotesCount: '0', newsCount: String(count), enableFuzzyQuery: 'true' })
  const errors = []
  for (const url of yahooProxyUrls(`/v1/finance/search?${params}`)) {
    try {
      const response = await fetch(url)
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || data?.finance?.error?.description || `Yahoo news request failed (${response.status}).`)
      return Array.isArray(data?.news) ? data.news : []
    } catch (error) {
      errors.push(error)
    }
  }
  throw errors[0] || new Error('Yahoo Finance news could not be reached.')
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

const normalizeYahooNewsEvent = (item, watchAliases, type, query) => {
  const title = first(item.title, item.headline, 'Market news')
  const symbols = (item.relatedTickers || item.symbols || []).map((symbol) => String(symbol).toUpperCase())
  const matchedSymbols = symbols.filter((symbol) => watchAliases.has(symbol) || watchAliases.has(symbol.replace(/\.(NE|TO|V)$/i, '')))
  return {
    id: `yahoo-${type}:${first(item.uuid, item.link, title)}`,
    type,
    date: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : first(item.publishedDate, item.date),
    direction: 'recent',
    title,
    site: first(item.publisher, item.site, 'Yahoo Finance'),
    url: first(item.link, item.url),
    query,
    symbols: matchedSymbols.length ? matchedSymbols : symbols,
    source: 'Yahoo Finance',
  }
}

const normalizeMarketauxNewsEvent = (item, watchAliases, type, query) => {
  const symbols = (item.entities || []).map((entity) => String(entity.symbol || '').toUpperCase()).filter(Boolean)
  const matchedSymbols = symbols.filter((symbol) => watchAliases.has(symbol) || watchAliases.has(symbol.replace(/\.(NE|TO|V)$/i, '')))
  return {
    id: `marketaux-${type}:${first(item.uuid, item.url, item.title)}`,
    type,
    date: first(item.published_at, item.publishedAt, item.date),
    direction: 'recent',
    title: first(item.title, 'Market news'),
    description: first(item.description, item.snippet),
    site: first(item.source?.name, item.source, 'Marketaux'),
    url: first(item.url),
    query,
    symbols: matchedSymbols.length ? matchedSymbols : symbols,
    sentiment: item.entities?.find((entity) => matchedSymbols.includes(String(entity.symbol).toUpperCase()))?.sentiment_score ?? null,
    source: 'Marketaux',
  }
}

async function fetchMarketauxEvents(symbols, watchAliases, apiKey) {
  if (!apiKey) return { events: [], errors: [] }
  const baseSymbols = [...new Set(symbols.map((symbol) => symbol.replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')).filter(Boolean))].slice(0, 25)
  const macroQueries = ['Federal Reserve market', 'inflation CPI market', 'nonfarm payrolls jobs report', 'Iran oil market']
  const requests = [
    ...baseSymbols.map((symbol) => fetchMarketauxNews({ symbols: symbol }, apiKey)
      .then((items) => items.map((item) => normalizeMarketauxNewsEvent(item, watchAliases, 'stock-news', symbol)))),
    ...macroQueries.map((query) => fetchMarketauxNews({ search: query }, apiKey)
      .then((items) => items.map((item) => normalizeMarketauxNewsEvent(item, watchAliases, 'market-news', query)))),
  ]
  const settled = await Promise.allSettled(requests)
  return {
    events: settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    errors: settled.filter((result) => result.status === 'rejected').map((result) => result.reason?.message || 'Marketaux request failed.'),
  }
}

async function fetchYahooFallbackEvents(symbols, watchAliases) {
  const baseSymbols = symbols.map((symbol) => symbol.replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')).filter(Boolean)
  const stockQueries = [...new Set(baseSymbols)].slice(0, 20)
  const macroQueries = ['Federal Reserve market', 'inflation CPI market', 'jobs report nonfarm payrolls', 'Iran oil market']
  const requests = [
    ...stockQueries.map((query) => fetchYahooFinanceNews(query, 5).then((items) => items.map((item) => normalizeYahooNewsEvent(item, watchAliases, 'stock-news', query)))),
    ...macroQueries.map((query) => fetchYahooFinanceNews(query, 6).then((items) => items.map((item) => normalizeYahooNewsEvent(item, watchAliases, 'market-news', query)))),
  ]
  const settled = await Promise.allSettled(requests)
  return {
    events: settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    errors: settled.filter((result) => result.status === 'rejected').map((result) => result.reason?.message || 'Yahoo news request failed.'),
  }
}

export async function buildEventsCalendarExport(symbols = getWatchlist(), { pastDays = 30, futureDays = 31 } = {}) {
  const settings = getSettings()
  const apiKey = settings.fmpApiKey?.trim()
  const marketauxApiKey = settings.marketauxApiKey?.trim()
  const now = today()
  const from = isoDate(addDays(now, -pastDays))
  const to = isoDate(addDays(now, futureDays))
  const watchAliases = symbolAliases(symbols)
  const base = {
    generatedAt: new Date().toISOString(),
    source: 'TradeMarker',
    provider: 'Financial Modeling Prep + Marketaux + Yahoo Finance',
    range: { from, to, pastDays, futureDays },
    note: 'Events are reference data only. Verify dates with primary sources before trading.',
    watchlist: symbols,
    events: [],
    errors: [],
  }
  const skipped = []
  if (!apiKey) skipped.push({ source: 'fmp', message: 'No FMP API key configured; skipped FMP economic calendar, earnings, and news.' })
  if (!marketauxApiKey) skipped.push({ source: 'marketaux', message: 'No Marketaux API key configured; skipped Marketaux news.' })

  const [economic, earnings, stockNews, generalNews, marketaux, yahooFallback] = await Promise.all([
    apiKey ? fetchFmp('/economic-calendar', { from, to }, apiKey).catch((error) => ({ error })) : Promise.resolve([]),
    apiKey ? fetchFmp('/earnings-calendar', { from, to }, apiKey).catch((error) => ({ error })) : Promise.resolve([]),
    apiKey ? fetchFmp('/news/stock-latest', { symbols: [...watchAliases].slice(0, 80).join(','), limit: '80' }, apiKey).catch((error) => ({ error })) : Promise.resolve([]),
    apiKey ? fetchFmp('/news/general-latest', { limit: '80' }, apiKey).catch((error) => ({ error })) : Promise.resolve([]),
    fetchMarketauxEvents(symbols, watchAliases, marketauxApiKey).catch((error) => ({ error, events: [], errors: [error.message] })),
    fetchYahooFallbackEvents(symbols, watchAliases).catch((error) => ({ error, events: [], errors: [error.message] })),
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
    ...(marketaux.events || []),
    ...(yahooFallback.events || []),
  ]
  if (marketaux.error) base.errors.push({ source: 'marketaux', message: marketaux.error.message })
  ;(marketaux.errors || []).slice(0, 5).forEach((message) => base.errors.push({ source: 'marketaux', message }))
  if (yahooFallback.error) base.errors.push({ source: 'yahoo-news-fallback', message: yahooFallback.error.message })
  ;(yahooFallback.errors || []).slice(0, 5).forEach((message) => base.errors.push({ source: 'yahoo-news-fallback', message }))

  const unique = new Map()
  events.forEach((event) => {
    if (!event.date) return
    unique.set(event.id, event)
  })
  const scored = [...unique.values()].map((event) => ({
    ...event,
    impactScore: scoreEventImpact(event, watchAliases, now),
  }))
  const sorted = scored.sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
  const symbolEvents = sorted.filter((event) => !isMacroEvent(event))
  const macroEvents = sorted.filter(isMacroEvent)
  return {
    ...base,
    status: base.errors.length ? 'partial' : 'ok',
    skipped,
    events: sorted,
    symbolEvents,
    macroEvents,
    upcoming: sorted.filter((event) => event.direction === 'upcoming'),
    recent: sorted.filter((event) => event.direction === 'recent'),
  }
}
