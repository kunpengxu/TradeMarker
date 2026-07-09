import SymbolLink from './SymbolLink'
import { money, number } from '../utils/formatters'
import { useI18n } from '../i18n'

const sideClass = (side) => String(side || '').toLowerCase().replace(/[^a-z]/g, '-')
const formatMaybeMoney = (value) => value == null ? '—' : money(value)
const formatMaybeNumber = (value) => value == null ? '—' : number(value, 4)
const hasValue = (value) => value != null && Number(value) !== 0
const compactText = (value, max = 180) => {
  const text = safeText(value).trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
export const safeText = (value, language) => {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map((item) => safeText(item, language)).filter(Boolean).join(' · ')
  if (typeof value !== 'object') return String(value)
  const direct = safeText(value[language], language) ||
    safeText(value.en, language) ||
    safeText(value.zh, language) ||
    safeText(value.cn, language) ||
    safeText(value.text, language) ||
    safeText(value.label, language) ||
    safeText(value.note, language) ||
    safeText(value.reason, language) ||
    safeText(value.summary, language)
  if (direct) return direct
  return Object.values(value).map((item) => safeText(item, language)).filter(Boolean).join(' · ')
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
    const condition = safeText(leg.conditionText, language) || safeText(leg.condition, language)
    const note = safeText(leg.noteText, language) || safeText(leg.note, language)
    const parts = [
      leg.side ? safeText(translateToken(leg.side, language), language) : null,
      safeText(translateToken(leg.orderType, language), language),
      hasValue(leg.price) ? `${t('limit')} ${formatMaybeMoney(leg.price)}` : null,
      hasValue(leg.shares) ? `${t('shares')} ${formatMaybeNumber(leg.shares)}` : null,
      hasValue(leg.amount) ? `${t('amount')} ${formatMaybeMoney(leg.amount)}` : null,
      hasValue(leg.percent) ? `${t('size')} ${leg.percent}%` : null,
    ].filter(Boolean)
    return <div className="order-leg compact" key={leg.id || index}>
      <strong>{safeText(leg.labelText, language) || safeText(leg.label, language)}</strong>
      <span>{parts.join(' · ') || t('notSpecified')}</span>
      {(condition || note) && <p>{compactText(condition || note, 150)}</p>}
    </div>
  })}</div>
}

export function localizedText(value, language) {
  return safeText(value, language)
}

export default function OrderPlanCard({ order }) {
  const { language, t } = useI18n()
  const reason = safeText(order.reasonText, language) || safeText(order.reason, language)
  const risk = safeText(order.riskText, language) || safeText(order.risk, language)
  const reEntryPlan = safeText(order.reEntryPlanText, language) || safeText(order.reEntryPlan, language)
  const note = safeText(order.noteText, language) || safeText(order.note, language)
  const metrics = [
    order.planType === 'INTRADAY' && order.intradayMode ? safeText(order.intradayMode, language) : null,
    hasValue(order.totalShares) ? `${t('shares')} ${formatMaybeNumber(order.totalShares)}` : null,
    hasValue(order.startingShares) && hasValue(order.expectedEndingShares) ? `${t('shares')} ${formatMaybeNumber(order.startingShares)} → ${formatMaybeNumber(order.expectedEndingShares)}` : null,
    hasValue(order.totalAmount) ? `${t('amount')} ${formatMaybeMoney(order.totalAmount)}` : null,
    hasValue(order.targetPrice) ? `${t('target')} ${formatMaybeMoney(order.targetPrice)}` : null,
    hasValue(order.stopLoss) ? `${t('stopLoss')} ${formatMaybeMoney(order.stopLoss)}` : null,
    hasValue(order.takeProfit) ? `${t('takeProfit')} ${formatMaybeMoney(order.takeProfit)}` : null,
    order.status ? `${t('status')} ${safeText(translateToken(order.status, language), language)}` : null,
  ].filter(Boolean)
  return <article className={`order-plan-card ${sideClass(order.side)}`}>
    <header><div><span className={`side ${sideClass(order.side)}`}>{safeText(translateToken(order.side, language), language)}</span><h3>{order.symbol ? <SymbolLink symbol={order.symbol} /> : t('noSymbol')}</h3></div>{order.priority && <strong>{safeText(translateToken(order.priority, language), language)}</strong>}</header>
    {metrics.length ? <p className="order-compact-meta">{metrics.join(' · ')}</p> : null}
    <OrderLegs legs={order.legs} t={t} language={language} />
    {(reason || risk || reEntryPlan || note) && <p className="order-compact-note">
      {reason && <><b>{t('reason')}:</b> {compactText(reason)} </>}
      {risk && <><b className="risk">{t('riskInvalidation')}:</b> {compactText(risk)} </>}
      {reEntryPlan && <><b>{t('plannedOrder')}:</b> {compactText(reEntryPlan)} </>}
      {note && <><b>{t('note')}:</b> {compactText(note)} </>}
    </p>}
  </article>
}
