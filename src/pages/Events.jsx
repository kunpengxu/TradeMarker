import { useEffect, useState } from 'react'
import SymbolLink from '../components/SymbolLink'
import { buildEventsCalendarExport } from '../services/eventsData'
import { saveEventsCalendarToGitHub } from '../services/githubSync'
import { calculatePosition } from '../services/positionCalculator'
import { getOrderCommitments, getTrades, getWatchlist } from '../services/storage'
import { useI18n } from '../i18n'

const badgeClass = (type) => type.replace(/[^a-z]/gi, '-').toLowerCase()
const formatDate = (date) => date ? new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: date.includes('T') || date.includes(':') ? 'short' : undefined }) : 'No date'
const formatEventDay = (date) => date ? new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'
const eventSymbols = (event) => {
  const symbols = event.symbol ? [event.symbol] : event.symbols || []
  return [...new Set(symbols)].slice(0, 4)
}

function EventCard({ event, t }) {
  const symbols = eventSymbols(event)
  return <article className="event-card">
    <time>{formatEventDay(event.date)}</time>
    <div className="event-card-body">
      <div><span className="event-badges"><span className={`event-type ${badgeClass(event.type)}`}>{event.type}</span>{symbols.length ? symbols.map((symbol) => <span className="event-symbol" key={symbol}><SymbolLink symbol={symbol} /></span>) : event.query ? <span className="event-symbol muted">query: {event.query}</span> : null}</span><strong>{formatDate(event.date)}</strong></div>
      <h3>{event.title}</h3>
      <p>{event.symbol ? <><SymbolLink symbol={event.symbol} /> · </> : null}{event.country ? `${event.country} · ` : ''}{event.site || event.source}</p>
      {event.description && <p className="event-description">{event.description}</p>}
      {event.type === 'earnings' && <small>{t('epsEst')} {event.epsEstimated ?? '—'} · {t('epsActual')} {event.epsActual ?? '—'} · {t('revenueEst')} {event.revenueEstimated ?? '—'}</small>}
      {event.type === 'economic' && <small>{t('impact')} {event.impact || '—'} · {t('actual')} {event.actual ?? '—'} · {t('estimate')} {event.estimate ?? '—'} · {t('previous')} {event.previous ?? '—'}</small>}
      {event.sentiment != null && <small>{t('sentiment')} {Number(event.sentiment).toFixed(3)}</small>}
      {event.url && <a href={event.url} target="_blank" rel="noreferrer">{t('openSource')}</a>}
    </div>
  </article>
}

export default function Events() {
  const { t } = useI18n()
  const [calendar, setCalendar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState('all')
  const [relevance, setRelevance] = useState('all')
  const watchlist = getWatchlist()

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const next = await buildEventsCalendarExport(getWatchlist())
      setCalendar(next)
      saveEventsCalendarToGitHub(next).catch(() => {})
      if (next.status === 'disabled') setMessage(t('addFmpKey'))
      else if (next.errors?.length) setMessage(t('loadedPartialEvents', { count: next.errors.length }))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const symbolMatches = (event, symbol) => {
    if (symbol === 'all') return true
    const clean = symbol.replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')
    return event.symbol === symbol || event.symbol === clean || event.symbols?.includes(symbol) || event.symbols?.includes(clean)
  }
  const stockEvents = (calendar?.symbolEvents || []).filter((event) => symbolMatches(event, selectedSymbol))
  const positionSymbols = new Set(watchlist.filter((symbol) => calculatePosition(getTrades(symbol), 0).shares > 0))
  const orderSymbols = new Set(getOrderCommitments().map((order) => order.symbol))
  const relevantStockEvents = stockEvents.filter((event) => {
    const symbols = eventSymbols(event)
    if (relevance === 'positions') return symbols.some((symbol) => positionSymbols.has(symbol))
    if (relevance === 'orders') return symbols.some((symbol) => orderSymbols.has(symbol))
    return true
  })
  const groupedStockEvents = relevantStockEvents.reduce((groups, event) => {
    const symbols = eventSymbols(event)
    const key = symbols.find((symbol) => watchlist.includes(symbol)) || symbols[0] || event.query || 'Market'
    groups.set(key, [...(groups.get(key) || []), event])
    return groups
  }, new Map())
  const macroEvents = relevance === 'macro' || relevance === 'all' ? calendar?.macroEvents || [] : []
  const diagnosticCount = (calendar?.skipped?.length || 0) + (calendar?.errors?.length || 0)
  return <section><div className="page-head"><div><p className="eyebrow">{t('eventsEyebrow')}</p><h1>{t('eventsTitle')}</h1><p>{t('eventsSubtitle')}</p></div><button onClick={load} disabled={loading}>{loading ? t('loading') : t('refreshEvents')}</button></div>
    {message && <p className="notice">{message}</p>}
    {calendar && <div className="event-overview-panel">
      <div className="event-summary">
        <span className="range">{t('range')}<strong>{calendar.range.from} → {calendar.range.to}</strong></span>
        <span className="upcoming">{t('upcoming')}<strong>{calendar.upcoming?.length || 0}</strong></span>
        <span className="recent">{t('recent')}<strong>{calendar.recent?.length || 0}</strong></span>
        <span className={`status ${calendar.status}`}>{t('status')}<strong>{calendar.status}</strong></span>
      </div>
      <div className="event-filter-stack">
        <label className="event-filter">{t('stockFilter')}<select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}><option value="all">{t('allWatchlistStocks')}</option>{watchlist.map((symbol) => <option value={symbol} key={symbol}>{symbol}</option>)}</select></label>
        <label className="event-filter">{t('relevanceFilter')}<select value={relevance} onChange={(event) => setRelevance(event.target.value)}><option value="all">{t('allEvents')}</option><option value="positions">{t('positionsOnly')}</option><option value="orders">{t('withOrderSuggestions')}</option><option value="macro">{t('macroOnly')}</option></select></label>
      </div>
    </div>}
    {loading ? <div className="loading">{t('loadingEvents')}</div> : <div className="events-grid">
      <div><h2>{t('stockNewsEvents')}</h2>{groupedStockEvents.size ? <div className="event-symbol-groups">{[...groupedStockEvents.entries()].map(([symbol, events]) => <section className="event-symbol-group" key={symbol}><h3>{symbol}<small>{events.length}</small></h3><div className="events-list">{events.map((event) => <EventCard event={event} key={event.id} t={t} />)}</div></section>)}</div> : <div className="empty-inline">{t('noStockEvents')}</div>}</div>
      <div><h2>{t('macroNewsEvents')}</h2>{macroEvents.length ? <div className="events-list">{macroEvents.map((event) => <EventCard event={event} key={event.id} t={t} />)}</div> : <div className="empty-inline">{t('noMacroEvents')}</div>}</div>
    </div>}
    {diagnosticCount ? <details className="panel event-diagnostics">
      <summary><span>{t('sourceDiagnostics')}</span><strong>{diagnosticCount}</strong></summary>
      {calendar?.skipped?.length ? <div className="event-skipped"><h2>{t('skippedOptionalSources')}</h2>{calendar.skipped.map((item) => <p key={item.source}><strong>{item.source}</strong>: {item.message}</p>)}</div> : null}
      {calendar?.errors?.length ? <div className="event-errors"><h2>{t('unavailableSources')}</h2>{calendar.errors.map((error, index) => <p key={`${error.source}-${index}`}><strong>{error.source}</strong>: {error.message}</p>)}</div> : null}
    </details> : null}
  </section>
}
