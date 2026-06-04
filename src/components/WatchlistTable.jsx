import StockCard from './StockCard'

export default function WatchlistTable({ items, onRemove }) {
  return <div className="stock-grid">{items.map((item) => <StockCard key={item.symbol} item={item} onRemove={onRemove} />)}</div>
}
