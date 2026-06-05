import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { dateTime, money, number, valueClass } from '../utils/formatters'

const Field = ({ label, children }) => {
  if (children == null || children === '') return null
  return <div><span>{label}</span><p>{children}</p></div>
}

export default function TradeJournalTimeline({ trades, currency = 'USD' }) {
  if (!trades.length) return <div className="empty-inline">No journal story yet.</div>
  const realizedPL = calculateRealizedPLByTrade(trades)
  const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date))
  return (
    <div className="journal-timeline">
      {sorted.map((trade) => {
        const tradeCurrency = trade.currency || currency
        const soldPL = trade.side === 'SELL' ? realizedPL.get(trade.id) : null
        return (
          <article className="journal-card" key={trade.id}>
            <div className="journal-card-head">
              <div><span className={`side ${trade.side.toLowerCase()}`}>{trade.side}</span><strong>{dateTime(trade.date)}</strong></div>
              {soldPL != null && <b className={valueClass(soldPL)}>Sold P/L {money(soldPL, tradeCurrency)}</b>}
            </div>
            <div className="journal-card-metrics">
              <span>Price <strong>{money(trade.price, tradeCurrency)}</strong></span>
              <span>Shares <strong>{number(trade.shares, 4)}</strong></span>
              <span>Reason <strong>{trade.reasonType || '—'}</strong></span>
              <span>Confidence <strong>{trade.confidence ? `${trade.confidence}/5` : '—'}</strong></span>
              <span>Target <strong>{trade.targetPrice ? money(trade.targetPrice, tradeCurrency) : '—'}</strong></span>
              <span>Stop <strong>{trade.stopLoss ? money(trade.stopLoss, tradeCurrency) : '—'}</strong></span>
              <span>Take profit <strong>{trade.takeProfit ? money(trade.takeProfit, tradeCurrency) : '—'}</strong></span>
            </div>
            <div className="journal-card-notes">
              <Field label="Thesis">{trade.thesis}</Field>
              <Field label="Invalidation">{trade.invalidation}</Field>
              <Field label="Risk">{trade.riskNote}</Field>
              <Field label="Note">{trade.note}</Field>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function DecisionTimeline({ trades, currency = 'USD' }) {
  if (!trades.length) return <div className="empty-inline">No decisions recorded yet.</div>
  const realizedPL = calculateRealizedPLByTrade(trades)
  return (
    <div className="decision-timeline">
      {[...trades].sort((a, b) => new Date(a.date) - new Date(b.date)).map((trade) => {
        const soldPL = trade.side === 'SELL' ? realizedPL.get(trade.id) : null
        return (
          <article key={trade.id}>
            <time>{new Date(trade.date).toISOString().slice(0, 10)}</time>
            <h3>{trade.side} {number(trade.shares, 4)} shares @ {money(trade.price, trade.currency || currency)}</h3>
            {trade.reasonType && <p><strong>Reason:</strong> {trade.reasonType}</p>}
            {soldPL != null && <p className={valueClass(soldPL)}><strong>Sold P/L:</strong> {money(soldPL, trade.currency || currency)}</p>}
            {trade.thesis && <p><strong>Thesis:</strong> {trade.thesis}</p>}
            {trade.invalidation && <p><strong>Invalidation:</strong> {trade.invalidation}</p>}
            {trade.riskNote && <p><strong>Risk:</strong> {trade.riskNote}</p>}
            {trade.note && <p><strong>Note:</strong> {trade.note}</p>}
          </article>
        )
      })}
    </div>
  )
}
