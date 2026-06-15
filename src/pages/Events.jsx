import { useEffect, useState } from 'react'
import SymbolLink from '../components/SymbolLink'
import { buildEventsCalendarExport } from '../services/eventsData'
import { saveEventsCalendarToGitHub } from '../services/githubSync'
import { getWatchlist } from '../services/storage'
import { useI18n } from '../i18n'

const badgeClass = (type) => type.replace(/[^a-z]/gi, '-').toLowerCase()
const formatDate = (date) => date ? new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: date.includes('T') || date.includes(':') ? 'short' : undefined }) : 'No date'
const eventSymbols = (event) => {
  const symbols = event.symbol ? [event.symbol] : event.symbols || []
  return [...new Set(symbols)].slice(0, 4)
}

function EventCard({ event, t }) {
  const symbols = eventSymbols(event)
  return <article className="event-card">
    <div><span className="event-badges"><span className={`event-type ${badgeClass(event.type)}`}>{event.type}</span>{symbols.length ? symbols.map((symbol) => <span className="event-symbol" key={symbol}><SymbolLink symbol={symbol} /></span>) : event.query ? <span className="event-symbol muted">query: {event.query}</span> : null}</span><strong>{formatDate(event.date)}</strong></div>
    <h3>{event.title}</h3>
    <p>{event.symbol ? <><SymbolLink symbol={event.symbol} /> · </> : null}{event.country ? `${event.country} · ` : ''}{event.site || event.source}</p>
    {event.description && <p className="event-description">{event.description}</p>}
    {event.type === 'earnings' && <small>{t('epsEst')} {event.epsEstimated ?? '—'} · {t('epsActual')} {event.epsActual ?? '—'} · {t('revenueEst')} {event.revenueEstimated ?? '—'}</small>}
    {event.type === 'economic' && <small>{t('impact')} {event.impact || '—'} · {t('actual')} {event.actual ?? '—'} · {t('estimate')} {event.estimate ?? '—'} · {t('previous')} {event.previous ?? '—'}</small>}
    {event.sentiment != null && <small>{t('sentiment')} {Number(event.sentiment).toFixed(3)}</small>}
    {event.url && <a href={event.url} target="_blank" rel="noreferrer">{t('openSource')}</a>}
  </article>
}

export default function Events() {
  const { t } = useI18n()
  const [calendar, setCalendar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState('all')
  const watchlist = getWatchlist()

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const next = await buildEventsCalendarExport(getWatchlist())
      setCalendar(next)
      const saved = await saveEventsCalendarToGitHub(next)
      if (next.status === 'disabled') setMessage(t('addFmpKey'))
      else if (saved.status === 'disabled') setMessage('GitHub sync is not configured.')
      else if (next.errors?.length) setMessage(t('loadedPartialEvents', { count: next.errors.length }))
      else setMessage(`Events calendar synced ${new Date().toLocaleTimeString()}`)
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
  const macroEvents = calendar?.macroEvents || []
  return <section><div className="page-head"><div><p className="eyebrow">{t('eventsEyebrow')}</p><h1>{t('eventsTitle')}</h1><p>{t('eventsSubtitle')}</p></div><button onClick={load} disabled={loading}>{loading ? t('loading') : t('refreshEvents')}</button></div>
    {message && <p className="notice">{message}</p>}
    {calendar && <div className="event-summary">
      <span>{t('range')}<strong>{calendar.range.from} → {calendar.range.to}</strong></span>
      <span>{t('upcoming')}<strong>{calendar.upcoming?.length || 0}</strong></span>
      <span>{t('recent')}<strong>{calendar.recent?.length || 0}</strong></span>
      <span>{t('status')}<strong>{calendar.status}</strong></span>
    </div>}
    <div className="event-controls"><label>{t('stockFilter')}<select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}><option value="all">{t('allWatchlistStocks')}</option>{watchlist.map((symbol) => <option value={symbol} key={symbol}>{symbol}</option>)}</select></label></div>
    {calendar?.skipped?.length ? <div className="panel event-skipped"><h2>{t('skippedOptionalSources')}</h2>{calendar.skipped.map((item) => <p key={item.source}><strong>{item.source}</strong>: {item.message}</p>)}</div> : null}
    {calendar?.errors?.length ? <div className="panel event-errors"><h2>{t('unavailableSources')}</h2>{calendar.errors.map((error, index) => <p key={`${error.source}-${index}`}><strong>{error.source}</strong>: {error.message}</p>)}</div> : null}
    {loading ? <div className="loading">{t('loadingEvents')}</div> : <div className="events-grid">
      <div><h2>{t('stockNewsEvents')}</h2>{stockEvents.length ? <div className="events-list">{stockEvents.map((event) => <EventCard event={event} key={event.id} t={t} />)}</div> : <div className="empty-inline">{t('noStockEvents')}</div>}</div>
      <div><h2>{t('macroNewsEvents')}</h2>{macroEvents.length ? <div className="events-list">{macroEvents.map((event) => <EventCard event={event} key={event.id} t={t} />)}</div> : <div className="empty-inline">{t('noMacroEvents')}</div>}</div>
    </div>}
  </section>
}
