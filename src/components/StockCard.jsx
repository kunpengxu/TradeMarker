import SymbolLink from './SymbolLink'
import { money, number, percent, valueClass } from '../utils/formatters'

export default function StockCard({ item, onRemove }) {
  const { symbol, quote, position } = item
  return (
    <article className="stock-card">
      <div className="stock-card-head">
        <SymbolLink symbol={symbol} className="symbol-link" />
        <button className="icon-button" onClick={() => onRemove(symbol)} aria-label={`Remove ${symbol}`}>×</button>
      </div>
      <div className="price">{money(quote.price)}</div>
      <div className={valueClass(quote.change)}>{quote.change >= 0 ? '+' : ''}{money(quote.change)} · {percent(quote.changePercent)}</div>
      <div className="metric-grid">
        <span>Shares<strong>{number(position.shares, 4)}</strong></span>
        <span>Avg cost<strong>{money(position.averageCost)}</strong></span>
        <span>Market value<strong>{money(position.marketValue)}</strong></span>
        <span>Unrealized P/L<strong className={valueClass(position.unrealizedPL)}>{money(position.unrealizedPL)} ({percent(position.unrealizedPLPercent)})</strong></span>
      </div>
    </article>
  )
}
