import { money, percent, valueClass } from '../utils/formatters'

export default function WatchlistSidebar({ items, selected, onSelect, onRemove }) {
  return (
    <aside className="market-sidebar">
      <div className="sidebar-title">
        <div>
          <span className="eyebrow">Personal list</span>
          <h2>Watchlist</h2>
        </div>
        <span className="watch-count">{items.length}</span>
      </div>
      <div className="watch-columns"><span>Symbol</span><span>Price</span><span>% Chg</span></div>
      <div className="watch-rows">
        {items.map((item) => (
          <button
            className={`watch-row ${selected === item.symbol ? 'selected' : ''}`}
            key={item.symbol}
            onClick={() => onSelect(item.symbol)}
          >
            <span className="watch-symbol">
              <strong>{item.symbol}</strong>
              <small>{item.position.shares ? `${item.position.shares} shares` : 'No position'}</small>
            </span>
            <strong className={valueClass(item.quote.change)}>{money(item.quote.price)}</strong>
            <strong className={valueClass(item.quote.change)}>{percent(item.quote.changePercent)}</strong>
            <span className="remove-watch" role="button" onClick={(event) => { event.stopPropagation(); onRemove(item.symbol) }}>×</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
