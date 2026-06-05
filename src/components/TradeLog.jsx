import { dateTime, money, number } from '../utils/formatters'
import { calculateRealizedPLByTrade } from '../services/positionCalculator'

export default function TradeLog({ trades, onDelete, onEdit, showSymbol = false, currency = 'USD' }) {
  if (!trades.length) return <div className="empty-inline">No journal entries yet.</div>
  const realizedPL = calculateRealizedPLByTrade(trades)
  return (
    <div className="table-wrap"><table><thead><tr>{showSymbol && <th>Symbol</th>}<th>Side</th><th>Price</th><th>Shares</th><th>Sold P/L</th><th>Date</th><th>Note</th><th /></tr></thead>
      <tbody>{[...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).map((trade) => <tr key={trade.id}>
        {showSymbol && <td><strong>{trade.symbol}</strong></td>}<td><span className={`side ${trade.side.toLowerCase()}`}>{trade.side}</span></td><td>{money(trade.price, trade.currency || currency)}</td><td>{number(trade.shares, 4)}</td><td className={trade.side === 'SELL' ? (realizedPL.get(trade.id) >= 0 ? 'positive' : 'negative') : ''}>{trade.side === 'SELL' ? money(realizedPL.get(trade.id), trade.currency || currency) : '—'}</td><td>{dateTime(trade.date)}</td><td>{trade.note || '—'}</td><td><div className="row-actions">{onEdit && <button className="text-button" onClick={() => onEdit(trade)}>Edit</button>}<button className="text-button danger" onClick={() => onDelete(trade.id)}>Delete</button></div></td>
      </tr>)}</tbody>
    </table></div>
  )
}
