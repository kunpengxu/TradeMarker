const isFiniteNumber = (value) => Number.isFinite(Number(value))

export const sma = (data, period) => {
  const result = []
  let sum = 0
  data.forEach((candle, index) => {
    sum += candle.close
    if (index >= period) sum -= data[index - period].close
    if (index >= period - 1) result.push({ time: candle.time, value: sum / period })
  })
  return result
}

export const ema = (data, period) => {
  const result = []
  const multiplier = 2 / (period + 1)
  let previous
  data.forEach((candle, index) => {
    if (!isFiniteNumber(candle.close)) return
    if (index === period - 1) {
      previous = data.slice(0, period).reduce((sum, item) => sum + item.close, 0) / period
    } else if (index >= period) {
      previous = (candle.close - previous) * multiplier + previous
    }
    if (index >= period - 1 && isFiniteNumber(previous)) result.push({ time: candle.time, value: previous })
  })
  return result
}

export const vwap = (data) => {
  let volumeSum = 0
  let valueSum = 0
  return data.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3
    const volume = Number(candle.volume || 0)
    volumeSum += volume
    valueSum += typical * volume
    return { time: candle.time, value: volumeSum ? valueSum / volumeSum : typical }
  })
}

export const rsi = (data, period = 14) => {
  const result = []
  let averageGain = 0
  let averageLoss = 0
  for (let index = 1; index < data.length; index += 1) {
    const change = data[index].close - data[index - 1].close
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)
    if (index <= period) {
      averageGain += gain
      averageLoss += loss
      if (index === period) {
        averageGain /= period
        averageLoss /= period
      }
    } else {
      averageGain = (averageGain * (period - 1) + gain) / period
      averageLoss = (averageLoss * (period - 1) + loss) / period
    }
    if (index >= period) {
      const rs = averageLoss === 0 ? 100 : averageGain / averageLoss
      result.push({ time: data[index].time, value: 100 - 100 / (1 + rs) })
    }
  }
  return result
}

export const macd = (data) => {
  const fast = ema(data, 12)
  const slow = ema(data, 26)
  const slowByTime = new Map(slow.map((point) => [point.time, point.value]))
  const macdLine = fast
    .filter((point) => slowByTime.has(point.time))
    .map((point) => ({ time: point.time, value: point.value - slowByTime.get(point.time) }))
  const signalSource = macdLine.map((point) => ({ time: point.time, close: point.value }))
  const signalLine = ema(signalSource, 9)
  const signalByTime = new Map(signalLine.map((point) => [point.time, point.value]))
  const histogram = macdLine
    .filter((point) => signalByTime.has(point.time))
    .map((point) => ({ time: point.time, value: point.value - signalByTime.get(point.time), color: point.value >= signalByTime.get(point.time) ? '#16a34a' : '#dc2626' }))
  return { macdLine, signalLine, histogram }
}
