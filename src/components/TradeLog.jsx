import { dateTime, money, number } from '../utils/formatters'

export default function TradeLog({ trades, onDelete, showSymbol = false }) {
  if (!trades.length) return <div className="empty-inline">No journal entries yet.</div>
  return (
    <div className="table-wrap"><table><thead><tr>{showSymbol && <th>Symbol</th>}<th>Side</th><th>Price</th><th>Shares</th><th>Date</th><th>Note</th><th /></tr></thead>
      <tbody>{[...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).map((trade) => <tr key={trade.id}>
        {showSymbol && <td><strong>{trade.symbol}</strong></td>}<td><span className={`side ${trade.side.toLowerCase()}`}>{trade.side}</span></td><td>{money(trade.price)}</td><td>{number(trade.shares, 4)}</td><td>{dateTime(trade.date)}</td><td>{trade.note || '—'}</td><td><button className="text-button danger" onClick={() => onDelete(trade.id)}>Delete</button></td>
      </tr>)}</tbody>
    </table></div>
  )
}
