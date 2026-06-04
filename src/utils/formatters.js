export const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export const number = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
export const percent = (value) => `${Number(value || 0) >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}%`
export const dateTime = (value) => new Date(value).toLocaleString()
export const valueClass = (value) => (Number(value) > 0 ? 'positive' : Number(value) < 0 ? 'negative' : '')
