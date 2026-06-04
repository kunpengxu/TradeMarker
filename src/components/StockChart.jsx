import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { resampleCandles } from '../services/resampleCandles'

const day = (value) => new Date(value).toISOString().slice(0, 10)

export default function StockChart({ candles, interval, trades, averageCost, closeOnly = false }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !candles.length) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 460,
      layout: { background: { color: '#111a2d' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#1c2941' }, horzLines: { color: '#1c2941' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#263650', timeVisible: true },
      rightPriceScale: { borderColor: '#263650' },
    })
    const showCloseLine = interval === 'daily' && closeOnly
    const series = showCloseLine
      ? chart.addLineSeries({ color: '#38bdf8', lineWidth: 2, priceLineVisible: true })
      : chart.addCandlestickSeries({
        upColor: '#2dd4bf', downColor: '#fb7185', wickUpColor: '#2dd4bf', wickDownColor: '#fb7185',
        borderVisible: false,
      })
    series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } })
    const data = resampleCandles(candles, interval)
    series.setData(showCloseLine ? data.map((candle) => ({ time: candle.time, value: candle.close })) : data)
    const tooltip = document.createElement('div')
    tooltip.className = 'chart-tooltip'
    containerRef.current.appendChild(tooltip)
    const candleByTime = new Map(data.map((candle, index) => [candle.time, { candle, previous: data[index - 1] }]))
    const showTooltip = (param) => {
      if (!param.time || !param.point) {
        tooltip.style.display = 'none'
        return
      }
      const entry = candleByTime.get(param.time)
      if (!entry) return
      const { candle, previous } = entry
      const change = previous ? candle.close - previous.close : 0
      const changePercent = previous?.close ? (change / previous.close) * 100 : 0
      const changeClass = change >= 0 ? 'positive' : 'negative'
      tooltip.innerHTML = `<strong>${candle.time}</strong><span>Open <b>${candle.open.toFixed(2)}</b></span><span>High <b>${candle.high.toFixed(2)}</b></span><span>Low <b>${candle.low.toFixed(2)}</b></span><span>Close <b>${candle.close.toFixed(2)}</b></span><span>Change <b class="${changeClass}">${change >= 0 ? '+' : ''}${change.toFixed(2)}</b></span><span>Change % <b class="${changeClass}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</b></span><span>Volume <b>${Number(candle.volume || 0).toLocaleString()}</b></span>`
      tooltip.style.display = 'grid'
      tooltip.style.left = `${param.point.x > containerRef.current.clientWidth / 2 ? 14 : containerRef.current.clientWidth - 214}px`
      tooltip.style.top = '14px'
    }
    chart.subscribeCrosshairMove(showTooltip)
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } })
    volumeSeries.setData(data.map((candle) => ({
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? '#14b8a655' : '#f43f5e55',
    })))
    const markerTime = (date) => {
      const target = day(date)
      return [...data].reverse().find((candle) => candle.time <= target)?.time || data[0].time
    }
    const markerLayer = document.createElement('div')
    markerLayer.className = 'trade-marker-layer'
    containerRef.current.appendChild(markerLayer)
    const markerEntries = trades.map((trade) => {
      const time = markerTime(trade.date)
      const element = document.createElement('span')
      element.className = `trade-chart-marker ${trade.side.toLowerCase()}`
      element.textContent = trade.side[0]
      element.title = `${trade.side} ${trade.shares} shares at $${Number(trade.price).toFixed(2)} on ${day(trade.date)}`
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
      const stacks = new Map()
      markerEntries.forEach(({ trade, time, element }) => {
        const x = chart.timeScale().timeToCoordinate(time)
        const y = series.priceToCoordinate(Number(trade.price))
        if (x == null || y == null) {
          element.style.display = 'none'
          return
        }
        const key = `${time}-${Number(trade.price).toFixed(4)}`
        const stack = stacks.get(key) || 0
        stacks.set(key, stack + 1)
        element.style.display = 'grid'
        element.style.left = `${x + stack * 10}px`
        element.style.top = `${y - stack * 10}px`
      })
    }
    positionMarkers()
    chart.timeScale().subscribeVisibleLogicalRangeChange(positionMarkers)
    const resizeObserver = new ResizeObserver(positionMarkers)
    resizeObserver.observe(containerRef.current)
    if (averageCost > 0) {
      series.createPriceLine({ price: averageCost, color: '#60a5fa', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Average cost' })
    }
    chart.timeScale().fitContent()
    return () => {
      resizeObserver.disconnect()
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(positionMarkers)
      chart.unsubscribeCrosshairMove(showTooltip)
      tooltip.remove()
      markerLayer.remove()
      chart.remove()
    }
  }, [candles, interval, trades, averageCost, closeOnly])

  return <div className="chart" ref={containerRef} />
}
