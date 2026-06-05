import { calculateRealizedPLByTrade } from '../services/positionCalculator'
import { dateTime, money, number, valueClass } from '../utils/formatters'

export const stars = (confidence) => confidence ? `${'★'.repeat(confidence)}${'☆'.repeat(5 - confidence)}` : '—'
export const Targets = ({ targets = [], currency = 'USD' }) => {
  if (!targets.length) return '—'
  return targets.map((target, index) => `TP${index + 1} ${money(target, currency)}`).join(', ')
}
export const ReasonChips = ({ tags = [] }) => tags.length ? <span className="reason-chips">{tags.map((tag) => <i key={tag}>{tag}</i>)}</span> : <strong>—</strong>

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
              <span>Reason <ReasonChips tags={trade.reasonTags} /></span>
              <span>Confidence <strong className="stars">{stars(trade.confidence)}</strong></span>
              <span>Targets <strong><Targets targets={trade.targets} currency={tradeCurrency} /></strong></span>
              <span>Stop <strong>{trade.stopLoss ? money(trade.stopLoss, tradeCurrency) : '—'}</strong></span>
              <span>Emotion <strong>{trade.emotion || '—'}</strong></span>
            </div>
            <div className="journal-card-notes">
              <Field label="Market context">{trade.marketContext}</Field>
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
            {trade.reasonTags?.length > 0 && <p><strong>Tags:</strong> {trade.reasonTags.join(', ')}</p>}
            {trade.confidence && <p><strong>Confidence:</strong> <span className="stars">{stars(trade.confidence)}</span></p>}
            {trade.targets?.length > 0 && <p><strong>Targets:</strong> <Targets targets={trade.targets} currency={trade.currency || currency} /></p>}
            {soldPL != null && <p className={valueClass(soldPL)}><strong>Sold P/L:</strong> {money(soldPL, trade.currency || currency)}</p>}
            {trade.marketContext && <p><strong>Market context:</strong> {trade.marketContext}</p>}
            {trade.thesis && <p><strong>Thesis:</strong> {trade.thesis}</p>}
            {trade.invalidation && <p><strong>Invalidation:</strong> {trade.invalidation}</p>}
            {trade.riskNote && <p><strong>Risk:</strong> {trade.riskNote}</p>}
            {trade.emotion && <p><strong>Emotion:</strong> {trade.emotion}</p>}
            {trade.note && <p><strong>Note:</strong> {trade.note}</p>}
          </article>
        )
      })}
    </div>
  )
}
