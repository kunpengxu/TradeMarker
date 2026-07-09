const numericValue = (value) => {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

export const number = (value, digits = 2) => numericValue(value).toLocaleString('en-US', { maximumFractionDigits: digits })
export const money = (value, currency = 'USD') => {
  const cleanCurrency = String(currency || 'USD').trim().toUpperCase()
  try {
    return numericValue(value).toLocaleString('en-US', { style: 'currency', currency: /^[A-Z]{3}$/.test(cleanCurrency) ? cleanCurrency : 'USD' })
  } catch {
    return `${number(value, 2)} ${cleanCurrency || 'USD'}`
  }
}
export const percent = (value) => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return '—'
  return `${numberValue >= 0 ? '+' : ''}${numberValue.toFixed(2)}%`
}
export const dateTime = (value) => new Date(value).toLocaleString()
export const valueClass = (value) => (Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : '')
