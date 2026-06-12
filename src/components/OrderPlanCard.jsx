import SymbolLink from './SymbolLink'
import { money, number } from '../utils/formatters'
import { useI18n } from '../i18n'

const sideClass = (side) => side.toLowerCase().replace(/[^a-z]/g, '-')
const formatMaybeMoney = (value) => value == null ? '—' : money(value)
const formatMaybeNumber = (value) => value == null ? '—' : number(value, 4)
const hasValue = (value) => value != null && Number(value) !== 0
const compactText = (value, max = 180) => {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
const textFor = (value, language) => {
  if (!value || typeof value !== 'object') return value || ''
  return value[language] || value.en || value.zh || ''
}
const translateToken = (value, language) => {
  if (language !== 'zh') return value
  const key = String(value || '').toUpperCase().replace(/\s+/g, '_')
  const map = {
    HIGH: '高',
    MEDIUM: '中',
    LOW: '低',
    READY: '可执行',
    CONDITIONAL: '条件触发',
    PROPOSED: '建议',
    NO_ACTION: '不操作',
    LIMIT: '限价',
    MARKET: '市价',
    BUY: '买入',
    SELL: '卖出',
    WATCH: '观察',
  }
  return map[key] || value
}

function OrderLegs({ legs, t, language }) {
  return <div className="order-leg-list compact">{legs.map((leg, index) => {
    const condition = textFor(leg.conditionText, language) || leg.condition
    const note = textFor(leg.noteText, language) || leg.note
    const parts = [
      translateToken(leg.orderType, language),
      hasValue(leg.price) ? `${t('limit')} ${formatMaybeMoney(leg.price)}` : null,
      hasValue(leg.shares) ? `${t('shares')} ${formatMaybeNumber(leg.shares)}` : null,
      hasValue(leg.amount) ? `${t('amount')} ${formatMaybeMoney(leg.amount)}` : null,
      hasValue(leg.percent) ? `${t('size')} ${leg.percent}%` : null,
    ].filter(Boolean)
    return <div className="order-leg compact" key={leg.id || index}>
      <strong>{textFor(leg.labelText, language) || leg.label}</strong>
      <span>{parts.join(' · ') || t('notSpecified')}</span>
      {(condition || note) && <p>{compactText(condition || note, 150)}</p>}
    </div>
  })}</div>
}

export function localizedText(value, language) {
  return textFor(value, language)
}

export default function OrderPlanCard({ order }) {
  const { language, t } = useI18n()
  const reason = textFor(order.reasonText, language) || order.reason
  const risk = textFor(order.riskText, language) || order.risk
  const note = textFor(order.noteText, language) || order.note
  const metrics = [
    hasValue(order.totalShares) ? `${t('shares')} ${formatMaybeNumber(order.totalShares)}` : null,
    hasValue(order.totalAmount) ? `${t('amount')} ${formatMaybeMoney(order.totalAmount)}` : null,
    hasValue(order.targetPrice) ? `${t('target')} ${formatMaybeMoney(order.targetPrice)}` : null,
    hasValue(order.stopLoss) ? `${t('stopLoss')} ${formatMaybeMoney(order.stopLoss)}` : null,
    hasValue(order.takeProfit) ? `${t('takeProfit')} ${formatMaybeMoney(order.takeProfit)}` : null,
    order.status ? `${t('status')} ${translateToken(order.status, language)}` : null,
  ].filter(Boolean)
  return <article className={`order-plan-card ${sideClass(order.side)}`}>
    <header><div><span className={`side ${sideClass(order.side)}`}>{translateToken(order.side, language)}</span><h3>{order.symbol ? <SymbolLink symbol={order.symbol} /> : t('noSymbol')}</h3></div>{order.priority && <strong>{translateToken(order.priority, language)}</strong>}</header>
    {metrics.length ? <p className="order-compact-meta">{metrics.join(' · ')}</p> : null}
    <OrderLegs legs={order.legs} t={t} language={language} />
    {(reason || risk || note) && <p className="order-compact-note">
      {reason && <><b>{t('reason')}:</b> {compactText(reason)} </>}
      {risk && <><b className="risk">{t('riskInvalidation')}:</b> {compactText(risk)} </>}
      {note && <><b>{t('note')}:</b> {compactText(note)} </>}
    </p>}
  </article>
}
