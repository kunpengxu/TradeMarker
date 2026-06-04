import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { resampleCandles } from '../services/resampleCandles'

const day = (value) => new Date(value).toISOString().slice(0, 10)

export default function StockChart({ candles, interval, trades, averageCost }) {
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
    const series = chart.addCandlestickSeries({
      upColor: '#2dd4bf', downColor: '#fb7185', wickUpColor: '#2dd4bf', wickDownColor: '#fb7185',
      borderVisible: false,
    })
    series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } })
    const data = resampleCandles(candles, interval)
    series.setData(data)
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
      const candle = data.find((item) => item.time === time)
      const element = document.createElement('span')
      element.className = `trade-chart-marker ${trade.side.toLowerCase()}`
      element.textContent = trade.side[0]
      markerLayer.appendChild(element)
      return { trade, time, candle, element }
    })
    const positionMarkers = () => {
      const stacks = new Map()
      markerEntries.forEach(({ trade, time, candle, element }) => {
        const x = chart.timeScale().timeToCoordinate(time)
        const anchor = trade.side === 'BUY' ? candle?.low : candle?.high
        const y = anchor == null ? null : series.priceToCoordinate(anchor)
        if (x == null || y == null) {
          element.style.display = 'none'
          return
        }
        const key = `${time}-${trade.side}`
        const stack = stacks.get(key) || 0
        stacks.set(key, stack + 1)
        const offset = 22 + stack * 28
        element.style.display = 'grid'
        element.style.left = `${x}px`
        element.style.top = `${trade.side === 'BUY' ? y + offset : y - offset}px`
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
      markerLayer.remove()
      chart.remove()
    }
  }, [candles, interval, trades, averageCost])

  return <div className="chart" ref={containerRef} />
}
