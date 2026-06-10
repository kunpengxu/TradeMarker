import { useEffect, useState } from 'react'

const CHART_INDICATORS_KEY = 'trademarker.chartIndicators'

export const DEFAULT_CHART_INDICATORS = {
  vwap: true,
  sma20: true,
  sma50: true,
  sma200: true,
  ema50: true,
  rsi14: true,
  macd: true,
  volume: true,
}

export const CHART_INDICATOR_OPTIONS = [
  { key: 'vwap', label: 'VWAP' },
  { key: 'sma20', label: 'SMA 20' },
  { key: 'sma50', label: 'SMA 50' },
  { key: 'sma200', label: 'SMA 200' },
  { key: 'ema50', label: 'EMA 50' },
  { key: 'rsi14', label: 'RSI 14' },
  { key: 'macd', label: 'MACD' },
  { key: 'volume', label: 'Volume' },
]

export const normalizeChartIndicators = (value = {}) => ({
  ...DEFAULT_CHART_INDICATORS,
  ...(value && typeof value === 'object' ? value : {}),
})

export function useChartIndicators() {
  const [indicators, setIndicators] = useState(() => {
    try {
      return normalizeChartIndicators(JSON.parse(localStorage.getItem(CHART_INDICATORS_KEY) || '{}'))
    } catch {
      return DEFAULT_CHART_INDICATORS
    }
  })

  useEffect(() => {
    localStorage.setItem(CHART_INDICATORS_KEY, JSON.stringify(indicators))
  }, [indicators])

  return [indicators, setIndicators]
}
