import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { resampleCandles } from '../services/resampleCandles'

const day = (value) => new Date(value).toISOString().slice(0, 10)

export default function StockChart({ candles, interval, trades, orders, averageCost }) {
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
    series.setMarkers(trades.map((trade) => ({
      time: markerTime(trade.date),
      position: trade.side === 'BUY' ? 'belowBar' : 'aboveBar',
      color: trade.side === 'BUY' ? '#2dd4bf' : '#fb7185',
      shape: trade.side === 'BUY' ? 'arrowUp' : 'arrowDown',
      text: `${trade.side[0]} ${trade.shares} @ $${Number(trade.price).toFixed(2)}${trade.note ? ` · ${trade.note}` : ''}`,
    })).sort((a, b) => a.time.localeCompare(b.time)))
    if (averageCost > 0) {
      series.createPriceLine({ price: averageCost, color: '#60a5fa', lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Average cost' })
    }
    orders.filter((order) => order.status === 'OPEN').forEach((order) => {
      series.createPriceLine({
        price: Number(order.price), color: order.side === 'BUY' ? '#a78bfa' : '#fbbf24',
        lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Planned ${order.side}`,
      })
    })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [candles, interval, trades, orders, averageCost])

  return <div className="chart" ref={containerRef} />
}
