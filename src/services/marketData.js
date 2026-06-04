import { getSettings } from './storage.js'

const API_BASE = 'https://api.twelvedata.com'
const round = (value) => Number(Number(value).toFixed(2))

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

export async function getHistoricalDaily(symbol) {
  const data = await request('time_series', {
    symbol,
    interval: '1day',
    outputsize: '520',
    adjust: 'splits',
  })
  if (!Array.isArray(data.values) || !data.values.length) throw new Error(`No historical market data found for ${symbol}.`)

  return data.values.map((candle) => ({
    time: candle.datetime.slice(0, 10),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume || 0),
  })).reverse()
}

export async function getLatestQuote(symbol) {
  const data = await request('quote', { symbol, interval: '1day' })
  const price = Number(data.close)
  const previousClose = Number(data.previous_close)
  const change = Number.isFinite(Number(data.change)) ? Number(data.change) : price - previousClose
  const changePercent = Number.isFinite(Number(data.percent_change))
    ? Number(data.percent_change)
    : (change / previousClose) * 100

  if (!Number.isFinite(price)) throw new Error(`No current quote found for ${symbol}.`)
  return {
    symbol,
    name: data.name || symbol,
    exchange: data.exchange || 'US',
    currency: data.currency || 'USD',
    price: round(price),
    change: round(change),
    changePercent: round(changePercent),
    asOf: data.datetime || new Date().toISOString(),
    source: 'Twelve Data',
  }
}
