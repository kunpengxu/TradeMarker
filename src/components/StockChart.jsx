import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { resampleCandles } from '../services/resampleCandles'
import { ema, macd, rsi, sma, vwap } from '../services/technicalIndicators'
import { DEFAULT_CHART_INDICATORS, normalizeChartIndicators } from '../hooks/useChartIndicators'
import { money, number } from '../utils/formatters'

const day = (value) => new Date(value).toISOString().slice(0, 10)
const candleDay = (value) => typeof value === 'number' ? new Date(value * 1000).toISOString().slice(0, 10) : day(value)
const displayTime = (value) => typeof value === 'number' ? new Date(value * 1000).toLocaleString() : value
const stars = (confidence) => confidence ? `${'★'.repeat(confidence)}${'☆'.repeat(5 - confidence)}` : '—'
const preview = (value, length = 74) => value && value.length > length ? `${value.slice(0, length)}…` : value
const targetsText = (targets = [], currency) => targets.length ? targets.map((target, index) => `TP${index + 1} ${money(target, currency)}`).join(', ') : '—'
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export default function StockChart({ candles, interval, trades, averageCost, closeOnly = false, currency = 'USD', quoteChange = null, quotePrice = null, indicators = DEFAULT_CHART_INDICATORS }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !candles.length) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 460,
      layout: { background: { color: '#111a2d' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1c2941' }, horzLines: { color: '#1c2941' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#263650', timeVisible: true, rightOffset: interval === '1m' ? 3 : 0, barSpacing: interval === '1m' ? 5 : undefined },
      rightPriceScale: { borderColor: '#263650' },
    })
    const data = interval === '1m' ? candles : resampleCandles(candles, interval)
    const enabledIndicators = normalizeChartIndicators(indicators)
    const showIntradayLine = interval === '1m'
    const previousClose = showIntradayLine && Number.isFinite(Number(quotePrice)) && Number.isFinite(Number(quoteChange))
      ? Number(quotePrice) - Number(quoteChange)
      : null
    const showCloseLine = showIntradayLine || (interval === 'daily' && closeOnly)
    const intradayPositive = showIntradayLine ? data.at(-1)?.close >= data[0]?.close : true
    const intradayColor = intradayPositive ? '#10b981' : '#f43f5e'
    const series = showIntradayLine
      ? chart.addAreaSeries({
        lineColor: intradayColor,
        topColor: `${intradayColor}44`,
        bottomColor: `${intradayColor}05`,
        lineWidth: 2,
        priceLineVisible: true,
      })
      : showCloseLine
        ? chart.addLineSeries({ color: '#38bdf8', lineWidth: 2, priceLineVisible: true })
        : chart.addCandlestickSeries({
          upColor: '#2dd4bf', downColor: '#fb7185', wickUpColor: '#2dd4bf', wickDownColor: '#fb7185',
          borderVisible: false,
        })
    series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } })
    series.setData(showCloseLine ? data.map((candle) => ({ time: candle.time, value: candle.close })) : data)
    const overlayLines = [
      { key: 'vwap', label: 'VWAP', data: vwap(data), color: '#60a5fa' },
      { key: 'sma20', label: 'SMA 20', data: sma(data, 20), color: '#facc15' },
      { key: 'sma50', label: 'SMA 50', data: sma(data, 50), color: '#a78bfa' },
      { key: 'sma200', label: 'SMA 200', data: sma(data, 200), color: '#f472b6' },
      { key: 'ema50', label: 'EMA 50', data: ema(data, 50), color: '#22c55e' },
    ].filter((line) => enabledIndicators[line.key])
    overlayLines.forEach((line) => {
      if (!line.data.length) return
      chart.addLineSeries({ color: line.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }).setData(line.data)
    })
    const rsiValues = enabledIndicators.rsi14 ? rsi(data) : []
    if (enabledIndicators.rsi14) {
      const rsiSeries = chart.addLineSeries({ color: '#93c5fd', lineWidth: 2, priceScaleId: 'rsi', priceLineVisible: false })
      rsiSeries.setData(rsiValues)
      chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.68, bottom: enabledIndicators.macd ? 0.17 : 0 }, borderVisible: false })
      rsiSeries.createPriceLine({ price: 70, color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
      rsiSeries.createPriceLine({ price: 30, color: '#64748b', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
    }
    const macdValues = enabledIndicators.macd ? macd(data) : { histogram: [], macdLine: [], signalLine: [] }
    if (enabledIndicators.macd) {
      const macdHistogram = chart.addHistogramSeries({ priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false })
      macdHistogram.setData(macdValues.histogram)
      chart.addLineSeries({ color: '#22c55e', lineWidth: 1, priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false }).setData(macdValues.macdLine)
      chart.addLineSeries({ color: '#ef4444', lineWidth: 1, priceScaleId: 'macd', priceLineVisible: false, lastValueVisible: false }).setData(macdValues.signalLine)
      chart.priceScale('macd').applyOptions({ scaleMargins: { top: enabledIndicators.rsi14 ? 0.84 : 0.76, bottom: 0 }, borderVisible: false })
    }
    const legend = document.createElement('div')
    legend.className = 'indicator-legend'
    containerRef.current.appendChild(legend)
    const indicatorEntries = [
      ...overlayLines.map((line) => [line.label, new Map(line.data.map((point) => [point.time, point.value]))]),
      ...(enabledIndicators.rsi14 ? [['RSI 14', new Map(rsiValues.map((point) => [point.time, point.value]))]] : []),
      ...(enabledIndicators.macd ? [['MACD', new Map(macdValues.macdLine.map((point) => [point.time, point.value]))]] : []),
    ]
    const indicatorLookup = Object.fromEntries(indicatorEntries)
    const indicatorColors = {
      ...Object.fromEntries(overlayLines.map((line) => [line.label, line.color])),
      ...(enabledIndicators.rsi14 ? { 'RSI 14': '#93c5fd' } : {}),
      ...(enabledIndicators.macd ? { MACD: '#22c55e' } : {}),
    }
    const formatIndicator = (value) => Number.isFinite(value) ? value.toFixed(2) : '—'
    const renderLegend = (time = data.at(-1)?.time) => {
      legend.innerHTML = indicatorEntries.length
        ? `<strong>Indicators ${time ? displayTime(time) : ''}</strong>${Object.entries(indicatorLookup).map(([label, values]) => `<span style="color:${indicatorColors[label]}">${label} ${formatIndicator(values.get(time))}</span>`).join('')}`
        : ''
    }
    renderLegend()
    const tooltip = document.createElement('div')
    tooltip.className = 'chart-tooltip'
    containerRef.current.appendChild(tooltip)
    const markerTooltip = document.createElement('div')
    markerTooltip.className = 'marker-tooltip'
    containerRef.current.appendChild(markerTooltip)
    const candleByTime = new Map(data.map((candle, index) => [candle.time, { candle, previous: data[index - 1] }]))
    const candleOnlyByTime = new Map(data.map((candle) => [candle.time, candle]))
    const showTooltip = (param) => {
      if (!param.time || !param.point) {
        tooltip.style.display = 'none'
        renderLegend()
        return
      }
      const entry = candleByTime.get(param.time)
      if (!entry) return
      renderLegend(param.time)
      const { candle, previous } = entry
      const baseline = showIntradayLine && previousClose > 0 ? previousClose : previous?.close
      const change = baseline ? candle.close - baseline : 0
      const changePercent = baseline ? (change / baseline) * 100 : 0
      const changeClass = change >= 0 ? 'positive' : 'negative'
      const vwapTooltip = indicatorLookup.VWAP ? `<span>VWAP <b>${formatIndicator(indicatorLookup.VWAP.get(param.time))}</b></span>` : ''
      tooltip.innerHTML = showIntradayLine
        ? `<strong>${displayTime(candle.time)}</strong><span>Price <b>${candle.close.toFixed(2)}</b></span>${vwapTooltip}<span>Change <b class="${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(2)}</b></span><span>Change % <b class="${changeClass}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</b></span><span>Volume <b>${Number(candle.volume || 0).toLocaleString()}</b></span>`
        : `<strong>${displayTime(candle.time)}</strong><span>Open <b>${candle.open.toFixed(2)}</b></span><span>High <b>${candle.high.toFixed(2)}</b></span><span>Low <b>${candle.low.toFixed(2)}</b></span><span>Close <b>${candle.close.toFixed(2)}</b></span><span>Change <b class="${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(2)}</b></span><span>Change % <b class="${changeClass}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</b></span><span>Volume <b>${Number(candle.volume || 0).toLocaleString()}</b></span>`
      tooltip.style.display = 'grid'
      tooltip.style.left = `${param.point.x > containerRef.current.clientWidth / 2 ? 14 : containerRef.current.clientWidth - 214}px`
      tooltip.style.top = '14px'
    }
    chart.subscribeCrosshairMove(showTooltip)
    if (enabledIndicators.volume) {
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      })
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
      volumeSeries.setData(data.map((candle) => ({
        time: candle.time,
        value: candle.volume,
        color: showIntradayLine
          ? (candle.close >= (candle.open || candle.close) ? '#14b8a655' : '#f43f5e55')
          : (candle.close >= candle.open ? '#14b8a655' : '#f43f5e55'),
      })))
    }
    const markerTime = (date) => {
      const targetDay = day(date)
      if (typeof data[0]?.time === 'number') {
        const targetSeconds = Math.floor(new Date(date).getTime() / 1000)
        const sameDay = data.filter((candle) => candleDay(candle.time) === targetDay)
        return [...sameDay].reverse().find((candle) => candle.time <= targetSeconds)?.time || sameDay[0]?.time || data[0].time
      }
      return [...data].reverse().find((candle) => candle.time <= targetDay)?.time || data[0].time
    }
    const markerLayer = document.createElement('div')
    markerLayer.className = 'trade-marker-layer'
    containerRef.current.appendChild(markerLayer)
    const realizedPL = calculateRealizedPLByTrade(trades)
    const intradaySessionDay = showIntradayLine ? candleDay(data.at(-1)?.time) : null
    const visibleTrades = showIntradayLine
      ? trades.filter((trade) => candleDay(trade.date) === intradaySessionDay)
      : trades
    const hideMarkerTooltip = () => { markerTooltip.style.display = 'none' }
    const showMarkerTooltip = (trade, element) => {
      const tradeCurrency = trade.currency || currency
      const soldPL = trade.side === 'SELL' ? realizedPL.get(trade.id) : null
      markerTooltip.innerHTML = `
        <strong class="${trade.side.toLowerCase()}">${trade.side}</strong>
        <span>${day(trade.date)}</span>
        <span>Price <b>${money(trade.price, tradeCurrency)}</b></span>
        <span>Shares <b>${number(trade.shares, 4)}</b></span>
        ${soldPL != null ? `<span>Sold P/L <b class="${soldPL >= 0 ? 'positive' : 'negative'}">${money(soldPL, tradeCurrency)}</b></span>` : ''}
        <span>Tags <b>${escapeHtml(trade.reasonTags?.join(', ') || '—')}</b></span>
        <span>Confidence <b>${stars(trade.confidence)}</b></span>
        <span>Targets <b>${targetsText(trade.targets, tradeCurrency)}</b></span>
        <span>Stop <b>${trade.stopLoss ? money(trade.stopLoss, tradeCurrency) : '—'}</b></span>
        ${trade.thesis ? `<p>Thesis: ${escapeHtml(preview(trade.thesis))}</p>` : ''}
        ${trade.marketContext ? `<p>Context: ${escapeHtml(preview(trade.marketContext))}</p>` : ''}
      `
      markerTooltip.style.display = 'block'
      const rect = element.getBoundingClientRect()
      const parent = containerRef.current.getBoundingClientRect()
      const left = rect.left - parent.left
      markerTooltip.style.left = `${Math.min(Math.max(left + 14, 8), parent.width - 260)}px`
      markerTooltip.style.top = `${Math.max(rect.top - parent.top - 10, 8)}px`
    }
    const markerEntries = visibleTrades.map((trade) => {
      const time = markerTime(trade.date)
      const element = document.createElement('span')
      element.className = `trade-chart-marker ${trade.side.toLowerCase()}`
      element.innerHTML = '<i></i><b></b><em></em>'
      element.querySelector('i').textContent = trade.side[0]
      element.title = `${trade.side} ${trade.shares} shares at $${Number(trade.price).toFixed(2)} on ${day(trade.date)}`
      element.addEventListener('mouseenter', () => showMarkerTooltip(trade, element))
      element.addEventListener('click', () => showMarkerTooltip(trade, element))
      element.addEventListener('mouseleave', hideMarkerTooltip)
      markerLayer.appendChild(element)
      return { trade, time, element }
    })
    const tradeBounds = new Map()
    markerEntries.forEach(({ trade, time }) => {
      const price = Number(trade.price)
      if (!Number.isFinite(price)) return
      const bounds = tradeBounds.get(time) || { min: price, max: price }
      bounds.min = Math.min(bounds.min, price)
      bounds.max = Math.max(bounds.max, price)
      tradeBounds.set(time, bounds)
    })
    const sortedTradeBounds = [...tradeBounds].sort(([firstTime], [secondTime]) => firstTime.localeCompare(secondTime))
    const hiddenSeriesOptions = { color: 'rgba(0, 0, 0, 0)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }
    const tradeMinSeries = chart.addLineSeries(hiddenSeriesOptions)
    const tradeMaxSeries = chart.addLineSeries(hiddenSeriesOptions)
    tradeMinSeries.setData(sortedTradeBounds.map(([time, bounds]) => ({ time, value: bounds.min })))
    tradeMaxSeries.setData(sortedTradeBounds.map(([time, bounds]) => ({ time, value: bounds.max })))
    const positionMarkers = () => {
      const grouped = new Map()
      markerEntries.forEach((entry) => {
        const key = `${entry.time}-${entry.trade.side}`
        grouped.set(key, [...(grouped.get(key) || []), entry])
      })
      markerEntries.forEach(({ trade, time, element }, index) => {
        const x = chart.timeScale().timeToCoordinate(time)
        const priceY = series.priceToCoordinate(Number(trade.price))
        const candle = candleOnlyByTime.get(time)
        if (x == null || priceY == null || !candle) {
          element.style.display = 'none'
          return
        }
        const siblings = grouped.get(`${time}-${trade.side}`) || []
        const groupIndex = siblings.findIndex((entry) => entry.element === element)
        const centeredIndex = groupIndex - (siblings.length - 1) / 2
        const horizontalOffset = interval === '1m' ? centeredIndex * 10 : 0
        const labelDistance = 38 + groupIndex * 8
        const line = element.querySelector('b')
        line.style.height = `${labelDistance - 18}px`
        line.style.top = trade.side === 'BUY' ? `${10}px` : `${18 - labelDistance}px`
        element.classList.toggle('below', trade.side === 'BUY')
        element.classList.toggle('above', trade.side !== 'BUY')
        element.style.display = 'grid'
        element.style.left = `${x + horizontalOffset}px`
        element.style.top = `${priceY}px`
        element.style.setProperty('--label-offset', `${trade.side === 'BUY' ? labelDistance : -labelDistance}px`)
        element.style.zIndex = String(10 + index)
      })
    }
    positionMarkers()
    chart.timeScale().subscribeVisibleLogicalRangeChange(positionMarkers)
    const resizeObserver = new ResizeObserver(positionMarkers)
    resizeObserver.observe(containerRef.current)
    if (averageCost > 0 && !showIntradayLine) {
      series.createPriceLine({ price: averageCost, color: '#60a5fa', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Average cost' })
    }
    chart.timeScale().fitContent()
    return () => {
      resizeObserver.disconnect()
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(positionMarkers)
      chart.unsubscribeCrosshairMove(showTooltip)
      tooltip.remove()
      markerTooltip.remove()
      legend.remove()
      markerLayer.remove()
      chart.remove()
    }
  }, [candles, interval, trades, averageCost, closeOnly, currency, quoteChange, quotePrice, indicators])

  return <div className="chart" ref={containerRef} />
}
