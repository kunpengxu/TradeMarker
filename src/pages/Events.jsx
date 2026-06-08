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

  const events = calendar?.events || []
  return <section><div className="page-head"><div><p className="eyebrow">Market calendar</p><h1>News & Events</h1><p>Upcoming and recent macro events, earnings, and market-moving headlines sorted by date proximity.</p></div><button onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh events'}</button></div>
    {message && <p className="notice">{message}</p>}
    {calendar && <div className="event-summary">
      <span>Range<strong>{calendar.range.from} → {calendar.range.to}</strong></span>
      <span>Upcoming<strong>{calendar.upcoming?.length || 0}</strong></span>
      <span>Recent<strong>{calendar.recent?.length || 0}</strong></span>
      <span>Status<strong>{calendar.status}</strong></span>
    </div>}
    {loading ? <div className="loading">Loading events…</div> : events.length ? <div className="events-list">{events.map((event) => <EventCard event={event} key={event.id} />)}</div> : <div className="empty-inline">No events loaded yet.</div>}
  </section>
}
