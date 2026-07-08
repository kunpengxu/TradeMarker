import SymbolLink from './SymbolLink'
import { dateTime, money, number } from '../utils/formatters'
import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { useI18n } from '../i18n'

const formatTradeDate = (date) => {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return { date: '—', time: '' }
  return {
    date: value.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }),
    time: value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }
}
const compactNote = (note, max = 64) => {
  const text = String(note || '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
const sideLabel = (trade, t) => {
  if (trade.side === 'ORDER') {
    const status = trade.status ? t(`orderStatus${trade.status}`) : t('placedOrder')
    return trade.orderSide ? `${status} · ${trade.orderSide}` : status
  }
  return trade.side
}

export default function TradeLog({ trades, onDelete, onEdit, showSymbol = false, currency = 'USD' }) {
  const { t } = useI18n()
  if (!trades.length) return <div className="empty-inline">{t('noJournalEntries')}</div>
  const realizedPL = calculateRealizedPLByTrade(trades)
  return (
    <div className="table-wrap trade-log-table-wrap"><table className="trade-log-table"><thead><tr>{showSymbol && <th>{t('symbol')}</th>}<th>{t('side')}</th><th>{t('price')}</th><th>{t('shares')}</th><th>{t('soldPL')}</th><th>{t('date')}</th><th>{t('note')}</th><th /></tr></thead>
      <tbody>{[...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).map((trade) => {
        const soldPL = trade.side === 'SELL' ? realizedPL.get(trade.id) : null
        const tradeDate = formatTradeDate(trade.date)
        return <tr className={`trade-row ${trade.side.toLowerCase()} ${soldPL == null ? '' : soldPL >= 0 ? 'positive' : 'negative'}`} key={trade.id}>
          {showSymbol && <td><strong><SymbolLink symbol={trade.symbol} /></strong></td>}
          <td><span className={`side ${trade.side.toLowerCase()}`}>{sideLabel(trade, t)}</span></td>
          <td>{money(trade.price, trade.currency || currency)}</td>
          <td>{number(trade.shares, 4)}</td>
          <td className={soldPL == null ? '' : soldPL >= 0 ? 'positive' : 'negative'}>{soldPL == null ? '—' : <strong>{money(soldPL, trade.currency || currency)}</strong>}</td>
          <td><span className="trade-date"><strong>{tradeDate.date}</strong><small>{tradeDate.time || dateTime(trade.date)}</small></span></td>
          <td>{trade.note ? <span className="trade-note-chip">{compactNote(trade.note)}</span> : <span className="muted-dash">—</span>}</td>
          <td><div className="row-actions">{onEdit && !trade.orderCommitmentId && <button className="text-button" onClick={() => onEdit(trade)}>{t('edit')}</button>}<button className="text-button danger" onClick={() => onDelete(trade.id)}>{t('delete')}</button></div></td>
        </tr>
      })}</tbody>
    </table></div>
  )
}
