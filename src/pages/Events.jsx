import { useEffect, useState } from 'react'
import { buildEventsCalendarExport } from '../services/eventsData'
import { saveEventsCalendarToGitHub } from '../services/githubSync'
import { getWatchlist } from '../services/storage'

const badgeClass = (type) => type.replace(/[^a-z]/gi, '-').toLowerCase()
const formatDate = (date) => date ? new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: date.includes('T') || date.includes(':') ? 'short' : undefined }) : 'No date'

function EventCard({ event }) {
  return <article className="event-card">
    <div><span className={`event-type ${badgeClass(event.type)}`}>{event.type}</span><strong>{formatDate(event.date)}</strong></div>
    <h3>{event.title}</h3>
    <p>{event.symbol ? `${event.symbol} · ` : ''}{event.country ? `${event.country} · ` : ''}{event.site || event.source}</p>
    {event.type === 'earnings' && <small>EPS est {event.epsEstimated ?? '—'} · EPS actual {event.epsActual ?? '—'} · Revenue est {event.revenueEstimated ?? '—'}</small>}
    {event.type === 'economic' && <small>Impact {event.impact || '—'} · Actual {event.actual ?? '—'} · Estimate {event.estimate ?? '—'} · Previous {event.previous ?? '—'}</small>}
    {event.url && <a href={event.url} target="_blank" rel="noreferrer">Open source</a>}
  </article>
}

export default function Events() {
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
      saveEventsCalendarToGitHub(next).catch(() => {})
      if (next.status === 'disabled') setMessage('Add an FMP API key in Settings to load macro, earnings, and news events.')
      else if (next.errors?.length) setMessage(`Loaded partial events. ${next.errors.length} source request(s) failed.`)
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
  return <section><div className="page-head"><div><p className="eyebrow">Market calendar</p><h1>News & Events</h1><p>Stock-specific events and macro events, sorted newest first.</p></div><button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh events'}</button></div>
    {message && <p className="notice">{message}</p>}
    {calendar && <div className="event-summary">
      <span>Range<strong>{calendar.range.from} → {calendar.range.to}</strong></span>
      <span>Upcoming<strong>{calendar.upcoming?.length || 0}</strong></span>
      <span>Recent<strong>{calendar.recent?.length || 0}</strong></span>
      <span>Status<strong>{calendar.status}</strong></span>
    </div>}
    <div className="event-controls"><label>Stock filter<select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}><option value="all">All watchlist stocks</option>{watchlist.map((symbol) => <option value={symbol} key={symbol}>{symbol}</option>)}</select></label></div>
    {calendar?.errors?.length ? <div className="panel event-errors"><h2>Unavailable sources</h2>{calendar.errors.map((error, index) => <p key={`${error.source}-${index}`}><strong>{error.source}</strong>: {error.message}</p>)}</div> : null}
    {loading ? <div className="loading">Loading events…</div> : <div className="events-grid">
      <div><h2>Stock news / events</h2>{stockEvents.length ? <div className="events-list">{stockEvents.map((event) => <EventCard event={event} key={event.id} />)}</div> : <div className="empty-inline">No stock-specific events for this filter.</div>}</div>
      <div><h2>Macro news / events</h2>{macroEvents.length ? <div className="events-list">{macroEvents.map((event) => <EventCard event={event} key={event.id} />)}</div> : <div className="empty-inline">No macro events loaded yet.</div>}</div>
    </div>}
  </section>
}
