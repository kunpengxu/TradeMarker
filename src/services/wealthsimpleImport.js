const IMPORT_SOURCE = 'wealthsimple-holdings'

const parseNumber = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(number) ? number : 0
}

const parseCsvLine = (line) => {
  const cells = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}

export const parseCsv = (text) => {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim())
  const headers = parseCsvLine(lines[0] || '')
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']))
  })
}

export const reportDateFromFilename = (filename) => {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : new Date().toISOString().slice(0, 10)
}

export const mapWealthsimpleSymbol = (row) => {
  const symbol = row.Symbol?.trim().toUpperCase()
  const exchange = row.Exchange?.trim().toUpperCase()
  const mic = row.MIC?.trim().toUpperCase()
  const name = row.Name || ''
  if (!symbol) return ''
  if ((exchange === 'TSX' || mic === 'XTSE') && /CDR \(CAD Hedged\)/i.test(name)) return `${symbol}.NE`
  if (exchange === 'TSX' || mic === 'XTSE' || exchange === 'TSXV' || mic === 'XTSX') return `${symbol}.TO`
  return symbol
}

export const buildWealthsimpleHoldings = (text, filename, existingSymbols = []) => {
  const rows = parseCsv(text)
  const existing = new Set(existingSymbols.map((symbol) => symbol.toUpperCase()))
  const bySymbol = new Map()
  const skippedExisting = new Set()
  let skippedRows = 0

  rows.forEach((row) => {
    const symbol = mapWealthsimpleSymbol(row)
    const shares = parseNumber(row.Quantity)
    const cost = parseNumber(row['Book Value (Market)'])
    const currency = row['Book Value Currency (Market)'] || row['Market Value Currency'] || row['Market Price Currency'] || 'USD'
    const direction = row['Position Direction']?.trim().toUpperCase()
    if (!symbol || shares <= 0 || cost <= 0 || (direction && direction !== 'LONG')) {
      skippedRows += 1
      return
    }
    if (existing.has(symbol)) {
      skippedExisting.add(symbol)
      return
    }
    const current = bySymbol.get(symbol) || {
      symbol,
      shares: 0,
      cost: 0,
      currency,
      rows: [],
    }
    current.shares += shares
    current.cost += cost
    current.rows.push(row)
    bySymbol.set(symbol, current)
  })

  const reportDate = reportDateFromFilename(filename)
  const holdings = [...bySymbol.values()].map((holding) => {
    const avgCost = holding.cost / holding.shares
    const accountSummary = holding.rows
      .map((row) => `${row['Account Name']} ${row['Account Type']}`.trim())
      .filter(Boolean)
    const names = [...new Set(holding.rows.map((row) => row.Name).filter(Boolean))]
    return {
      ...holding,
      avgCost,
      reportDate,
      note: [
        'Imported from Wealthsimple holdings CSV.',
        `Cost basis: ${holding.currency} ${holding.cost.toFixed(2)} / ${holding.shares} shares.`,
        names.length ? `Name: ${names.join(' / ')}.` : '',
        accountSummary.length ? `Accounts: ${[...new Set(accountSummary)].join('; ')}.` : '',
      ].filter(Boolean).join(' '),
    }
  })

  return {
    importSource: IMPORT_SOURCE,
    holdings,
    totalRows: rows.length,
    skippedRows,
    skippedExisting: skippedExisting.size,
  }
}

export const createImportedTrade = (holding, date) => ({
  symbol: holding.symbol,
  side: 'BUY',
  price: Number(holding.avgCost.toFixed(4)),
  shares: Number(holding.shares.toFixed(6)),
  date: new Date(`${date}T12:00`).toISOString(),
  note: holding.note,
  importSource: IMPORT_SOURCE,
})
