import { useEffect, useMemo, useState } from 'react'
import { loadOrderPlanFromGitHub } from '../services/githubSync'
import { normalizeOrderPlan } from '../services/orderPlan'
import { money, number } from '../utils/formatters'

const sideLabel = { BUY: 'Buy orders', SELL: 'Sell orders', WATCH: 'Watch / no action' }
const sideClass = (side) => side.toLowerCase().replace(/[^a-z]/g, '-')
const formatDate = (date) => {
  const value = String(date || '')
  return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: value.includes('T') || value.includes(':') ? 'short' : undefined }) : 'Not specified'
}
const formatMaybeMoney = (value) => value == null ? '—' : money(value)
const formatMaybeNumber = (value) => value == null ? '—' : number(value, 4)

function OrderLegs({ legs }) {
  return <div className="order-leg-list">{legs.map((leg, index) => <div className="order-leg" key={leg.id || index}>
    <strong>{leg.label}</strong>
    <span>Type <b>{leg.orderType}</b></span>
    <span>Limit <b>{formatMaybeMoney(leg.price)}</b></span>
    <span>Shares <b>{formatMaybeNumber(leg.shares)}</b></span>
    <span>Amount <b>{formatMaybeMoney(leg.amount)}</b></span>
    {leg.percent != null && <span>Size <b>{leg.percent}%</b></span>}
    {leg.condition && <p>{leg.condition}</p>}
    {leg.note && <p>{leg.note}</p>}
  </div>)}</div>
}

function OrderCard({ order }) {
  return <article className={`order-plan-card ${sideClass(order.side)}`}>
    <header><div><span className={`side ${sideClass(order.side)}`}>{order.side}</span><h3>{order.symbol || 'No symbol'}</h3></div>{order.priority && <strong>{order.priority}</strong>}</header>
    <div className="order-metrics">
      <span>Total shares<strong>{formatMaybeNumber(order.totalShares)}</strong></span>
      <span>Total amount<strong>{formatMaybeMoney(order.totalAmount)}</strong></span>
      <span>Target<strong>{formatMaybeMoney(order.targetPrice)}</strong></span>
      <span>Stop loss<strong>{formatMaybeMoney(order.stopLoss)}</strong></span>
      <span>Take profit<strong>{formatMaybeMoney(order.takeProfit)}</strong></span>
      <span>Status<strong>{order.status}</strong></span>
    </div>
    {order.reason && <div className="order-note"><span>Reason</span><p>{order.reason}</p></div>}
    {order.risk && <div className="order-note risk"><span>Risk / invalidation</span><p>{order.risk}</p></div>}
    {order.note && <div className="order-note"><span>Note</span><p>{order.note}</p></div>}
    <OrderLegs legs={order.legs} />
  </article>
}

export default function OrderPlan() {
  const [plan, setPlan] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [filename, setFilename] = useState('order-plan.json')

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const result = await loadOrderPlanFromGitHub(filename)
      if (result.status === 'disabled') {
        setPlan(null)
        setMessage('GitHub sync is not configured. Set it in Settings first.')
      } else if (result.status === 'empty') {
        setPlan(null)
        setMessage(`No ${filename} found next to your trademarker.json file.`)
      } else {
        setPlan(normalizeOrderPlan(result.data))
        setMessage(`Loaded ${result.path}.`)
      }
    } catch (error) {
      setPlan(null)
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const grouped = useMemo(() => {
    const groups = { BUY: [], SELL: [], WATCH: [] }
    ;(plan?.orders || []).forEach((order) => {
      const key = order.side === 'BUY' || order.side === 'SELL' ? order.side : 'WATCH'
      groups[key].push(order)
    })
    return groups
  }, [plan])

  return <section><div className="page-head"><div><p className="eyebrow">GPT order plan</p><h1>Today’s Orders</h1><p>Read-only suggested buy/sell and ladder orders generated outside TradeMarker. No brokerage connection, no execution.</p></div><button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Reload plan'}</button></div>
    <div className="panel order-plan-source"><label>GitHub JSON file<input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="order-plan.json" /></label><small>Put this file in the same GitHub data folder as trademarker.json, for example data/order-plan.json.</small></div>
    {message && <p className="notice">{message}</p>}
    {plan && <div className="order-plan-summary">
      <span>Title<strong>{plan.title}</strong></span>
      <span>Trading date<strong>{plan.tradingDate || '—'}</strong></span>
      <span>Generated<strong>{formatDate(plan.generatedAt)}</strong></span>
      <span>Orders<strong>{plan.orders.length}</strong></span>
    </div>}
    {plan?.summary && <div className="panel"><h2>Plan summary</h2><p>{plan.summary}</p></div>}
    {plan?.assumptions?.length ? <div className="panel order-bullets"><h2>Assumptions</h2>{plan.assumptions.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {plan?.warnings?.length ? <div className="panel order-bullets warning"><h2>Warnings</h2>{plan.warnings.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    {loading ? <div className="loading">Loading order plan…</div> : plan ? <div className="order-plan-groups">{['BUY', 'SELL', 'WATCH'].map((side) => <section key={side}><h2>{sideLabel[side]} <small>{grouped[side].length}</small></h2>{grouped[side].length ? <div className="order-plan-list">{grouped[side].map((order) => <OrderCard order={order} key={order.id} />)}</div> : <div className="empty-inline">No {side.toLowerCase()} recommendations.</div>}</section>)}</div> : <div className="empty-inline">No order plan loaded.</div>}
  </section>
}
