import { useEffect, useMemo, useState } from 'react'
import { getWatchlistGroups, saveWatchlistGroups } from '../services/storage'
import { money, percent, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

const cleanSymbol = (value) => String(value || '').toUpperCase().replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')

export default function WatchlistSidebar({ items, selected, onSelect, onRemove, orderSymbols = [] }) {
  const { t } = useI18n()
  const [groups, setGroups] = useState(getWatchlistGroups)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'manual', direction: 'desc' })

  useEffect(() => setGroups(getWatchlistGroups()), [items])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.symbol, item])), [items])
  const orderSymbolSet = useMemo(() => new Set(orderSymbols.flatMap((symbol) => [String(symbol).toUpperCase(), cleanSymbol(symbol)])), [orderSymbols])
  const visible = (symbol) => {
    const item = itemMap.get(symbol)
    if (!item || !symbol.toLowerCase().includes(query.toLowerCase())) return false
    if (filter === 'positions') return item.position.shares > 0
    if (filter === 'orders') return orderSymbolSet.has(String(symbol).toUpperCase()) || orderSymbolSet.has(cleanSymbol(symbol))
    return true
  }
  const sortSymbols = (symbols) => {
    if (sort.key === 'manual') return symbols
    return [...symbols].sort((a, b) => {
      const first = itemMap.get(a)
      const second = itemMap.get(b)
      const direction = sort.direction === 'asc' ? 1 : -1
      if (sort.key === 'symbol') return a.localeCompare(b) * direction
      if (sort.key === 'price') return ((first?.quote?.price || 0) - (second?.quote?.price || 0)) * direction
      if (sort.key === 'change') return ((first?.quote?.changePercent || 0) - (second?.quote?.changePercent || 0)) * direction
      return ((first?.position?.unrealizedPL || 0) - (second?.position?.unrealizedPL || 0)) * direction
    })
  }
  const toggleSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
  }))
  const sortArrow = (key) => sort.key === key ? (sort.direction === 'desc' ? ' ↓' : ' ↑') : ''
  const persist = (next) => {
    setGroups(next)
    saveWatchlistGroups(next)
  }
  const moveSymbol = (symbol, groupId, beforeSymbol = null) => {
    if (!symbol || !itemMap.has(symbol)) return
    const next = groups.map((group) => ({ ...group, symbols: group.symbols.filter((item) => item !== symbol) }))
    const target = next.find((group) => group.id === groupId)
    const index = beforeSymbol ? target.symbols.indexOf(beforeSymbol) : -1
    target.symbols.splice(index >= 0 ? index : target.symbols.length, 0, symbol)
    persist(next)
  }
  const addGroup = () => {
    const name = prompt(t('groupName'))
    if (name?.trim()) persist([...groups, { id: `${Date.now()}`, name: name.trim(), symbols: [] }])
  }

  return (
    <aside className="market-sidebar">
      <div className="sidebar-title">
        <div><span className="eyebrow">{t('personalList')}</span><h2>{t('watchlist')}</h2></div>
        <button className="group-add" onClick={addGroup}>{t('addGroup')}</button>
      </div>
      <div className="watch-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('filterSymbols')} />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t('allStocks')}</option><option value="positions">{t('positionsOnly')}</option><option value="orders">{t('withOrderSuggestions')}</option></select>
        <select value={sort.key} onChange={(event) => setSort({ key: event.target.value, direction: 'desc' })}><option value="manual">{t('manualOrder')}</option><option value="change">{t('percentChange')}</option><option value="pl">{t('profitLoss')}</option></select>
      </div>
      <div className="watch-columns"><button onClick={() => toggleSort('symbol')}>{t('symbol')}{sortArrow('symbol')}</button><button onClick={() => toggleSort('price')}>{t('price')}{sortArrow('price')}</button><button onClick={() => toggleSort('change')}>{t('percentChange')}{sortArrow('change')}</button></div>
      <div className="watch-rows">
        {groups.map((group) => {
          const symbols = sortSymbols(group.symbols.filter(visible))
          return <section className="watch-group" key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveSymbol(event.dataTransfer.getData('text/plain'), group.id)}>
            <div className="watch-group-head"><strong>{group.name}</strong><span>{symbols.length}</span></div>
            {symbols.map((symbol) => {
              const item = itemMap.get(symbol)
              return <div
                className={`watch-row ${selected === symbol ? 'selected' : ''}`}
                key={symbol}
                role="button"
                tabIndex="0"
                draggable={sort.key === 'manual'}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', symbol)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.stopPropagation(); moveSymbol(event.dataTransfer.getData('text/plain'), group.id, symbol) }}
                onClick={() => onSelect(symbol)}
                onKeyDown={(event) => { if (event.key === 'Enter') onSelect(symbol) }}
              >
                <span className="watch-symbol"><strong>{symbol}</strong><small>{item.error || (item.position.shares ? `${item.position.shares} ${t('shares').toLowerCase()} · ${money(item.position.unrealizedPL, item.quote?.currency)}` : t('noPosition'))}</small></span>
                <strong className={valueClass(item.quote?.change)}>{item.quote ? money(item.quote.price, item.quote.currency) : '—'}</strong>
                <strong className={valueClass(item.quote?.change)}>{item.quote ? percent(item.quote.changePercent) : '—'}</strong>
                <select className="watch-group-select" value={group.id} onClick={(event) => event.stopPropagation()} onChange={(event) => moveSymbol(symbol, event.target.value)}>
                  {groups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
                <button className="remove-watch" onClick={(event) => { event.stopPropagation(); onRemove(symbol) }}>×</button>
              </div>
            })}
          </section>
        })}
      </div>
    </aside>
  )
}
