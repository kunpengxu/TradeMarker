import { calculatePosition } from './positionCalculator'
import { resampleCandles } from './resampleCandles'
import { getTrades } from './storage'
import { ema, macd, rsi, sma, vwap } from './technicalIndicators'

const INTERVALS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
const MAX_CANDLES = { daily: 120, weekly: 104, monthly: 60, quarterly: 40, yearly: 20 }
const MAX_INDICATOR_POINTS = 30

const round = (value, digits = 4) => {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null
}

const compactCandle = (candle) => ({
  time: candle.time,
  open: round(candle.open),
  high: round(candle.high),
  low: round(candle.low),
  close: round(candle.close),
  volume: round(candle.volume, 0),
})

const compactSeries = (points) => points.map((point) => ({
  time: point.time,
  value: round(point.value),
}))

const latestValue = (points) => round(points.at(-1)?.value)
const compactRecentSeries = (points) => compactSeries(points.slice(-MAX_INDICATOR_POINTS))

const buildIndicators = (candles) => {
  const vwapValues = vwap(candles)
  const sma20Values = sma(candles, 20)
  const sma50Values = sma(candles, 50)
  const sma200Values = sma(candles, 200)
  const ema50Values = ema(candles, 50)
  const rsi14Values = rsi(candles, 14)
  const macdValues = macd(candles)
  return {
    latest: {
      vwap: latestValue(vwapValues),
      sma20: latestValue(sma20Values),
      sma50: latestValue(sma50Values),
      sma200: latestValue(sma200Values),
      ema50: latestValue(ema50Values),
      rsi14: latestValue(rsi14Values),
      macd: {
        line: latestValue(macdValues.macdLine),
        signal: latestValue(macdValues.signalLine),
        histogram: latestValue(macdValues.histogram),
      },
    },
    recentSeries: {
      sma20: compactRecentSeries(sma20Values),
      sma50: compactRecentSeries(sma50Values),
      ema50: compactRecentSeries(ema50Values),
      rsi14: compactRecentSeries(rsi14Values),
      macd: {
        histogram: compactRecentSeries(macdValues.histogram),
      },
    },
  }
}

const buildIntervalData = (dailyCandles, interval) => {
  const sampled = resampleCandles(dailyCandles, interval).slice(-(MAX_CANDLES[interval] || 200))
  return {
    interval,
    candles: sampled.map(compactCandle),
    indicators: buildIndicators(sampled),
  }
}

const compactTrade = (trade) => ({
  id: trade.id,
  side: trade.side,
  orderSide: trade.orderSide || null,
  status: trade.status || null,
  source: trade.source || null,
  orderCommitmentId: trade.orderCommitmentId || null,
  price: round(trade.price),
  shares: round(trade.shares, 6),
  date: trade.date,
  reasonTags: trade.reasonTags || [],
  confidence: trade.confidence ?? null,
  thesis: trade.thesis || '',
  riskNote: trade.riskNote || '',
})

const compactPosition = (position) => ({
  shares: round(position.shares, 6),
  averageCost: round(position.averageCost),
  costBasis: round(position.costBasis),
  marketValue: round(position.marketValue),
  unrealizedPL: round(position.unrealizedPL),
  unrealizedPLPercent: round(position.unrealizedPLPercent),
})

export function buildMarketAnalysisExport(rows) {
  const generatedAt = new Date().toISOString()
  return {
    generatedAt,
    source: 'TradeMarker',
    purpose: 'AI-ready watchlist market context for visual trading journal analysis and suggested order planning.',
    note: 'Reference market data only. This file is not financial advice and does not execute orders.',
    dataShape: {
      candles: 'Recent OHLCV only, capped per interval to keep this file compact.',
      indicators: `Latest indicator values plus the most recent ${MAX_INDICATOR_POINTS} points for selected trend indicators.`,
    },
    intervals: INTERVALS,
    indicatorDefinitions: {
      vwap: 'Volume-weighted average price over the exported candles for that interval.',
      sma20: '20-period simple moving average.',
      sma50: '50-period simple moving average.',
      sma200: '200-period simple moving average.',
      ema50: '50-period exponential moving average.',
      rsi14: '14-period relative strength index.',
      macd: 'MACD 12/26 with 9-period signal line and histogram.',
    },
    symbols: rows.map((row) => {
      const trades = getTrades(row.symbol)
      const quote = row.quote || null
      const position = row.position || calculatePosition(trades, quote?.price || 0)
      return {
        symbol: row.symbol,
        status: row.error ? 'error' : 'ok',
        error: row.error || null,
        quote: quote ? {
          symbol: quote.symbol,
          exchange: quote.exchange,
          currency: quote.currency,
          price: round(quote.price),
          change: round(quote.change),
          changePercent: round(quote.changePercent),
          asOf: quote.asOf,
          source: quote.source,
          closeOnly: Boolean(quote.closeOnly),
        } : null,
        position: compactPosition(position),
        recentTrades: trades.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map(compactTrade),
        chartData: row.candles?.length ? Object.fromEntries(INTERVALS.map((interval) => [interval, buildIntervalData(row.candles, interval)])) : {},
      }
    }),
  }
}
