import SymbolLink from './SymbolLink'
import { dateTime, money, number } from '../utils/formatters'
import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { useI18n } from '../i18n'

export default function TradeLog({ trades, onDelete, onEdit, showSymbol = false, currency = 'USD' }) {
  const { t } = useI18n()
  if (!trades.length) return <div className="empty-inline">{t('noJournalEntries')}</div>
  const realizedPL = calculateRealizedPLByTrade(trades)
  return (
    <div className="table-wrap"><table><thead><tr>{showSymbol && <th>{t('symbol')}</th>}<th>{t('side')}</th><th>{t('price')}</th><th>{t('shares')}</th><th>{t('soldPL')}</th><th>{t('date')}</th><th>{t('note')}</th><th /></tr></thead>
      <tbody>{[...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).map((trade) => <tr key={trade.id}>
        {showSymbol && <td><strong><SymbolLink symbol={trade.symbol} /></strong></td>}<td><span className={`side ${trade.side.toLowerCase()}`}>{trade.side}</span></td><td>{money(trade.price, trade.currency || currency)}</td><td>{number(trade.shares, 4)}</td><td className={trade.side === 'SELL' ? (realizedPL.get(trade.id) >= 0 ? 'positive' : 'negative') : ''}>{trade.side === 'SELL' ? money(realizedPL.get(trade.id), trade.currency || currency) : '—'}</td><td>{dateTime(trade.date)}</td><td>{trade.note || '—'}</td><td><div className="row-actions">{onEdit && <button className="text-button" onClick={() => onEdit(trade)}>{t('edit')}</button>}<button className="text-button danger" onClick={() => onDelete(trade.id)}>{t('delete')}</button></div></td>
      </tr>)}</tbody>
    </table></div>
  )
}
