import { useEffect, useMemo, useState } from 'react'
import { getWatchlistGroups, saveWatchlistGroups } from '../services/storage'
import { money, percent, valueClass } from '../utils/formatters'

export default function WatchlistSidebar({ items, selected, onSelect, onRemove }) {
  const [groups, setGroups] = useState(getWatchlistGroups)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('manual')

  useEffect(() => setGroups(getWatchlistGroups()), [items])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.symbol, item])), [items])
  const visible = (symbol) => {
    const item = itemMap.get(symbol)
    if (!item || !symbol.toLowerCase().includes(query.toLowerCase())) return false
    return filter === 'all' || item.position.shares > 0
  }
  const sortSymbols = (symbols) => {
    if (sort === 'manual') return symbols
    return [...symbols].sort((a, b) => {
      const first = itemMap.get(a)
      const second = itemMap.get(b)
      if (sort === 'change') return (second?.quote?.changePercent || 0) - (first?.quote?.changePercent || 0)
      return (second?.position?.unrealizedPL || 0) - (first?.position?.unrealizedPL || 0)
    })
  }
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
    const name = prompt('Group name')
    if (name?.trim()) persist([...groups, { id: `${Date.now()}`, name: name.trim(), symbols: [] }])
  }

  return (
    <aside className="market-sidebar">
      <div className="sidebar-title">
        <div><span className="eyebrow">Personal list</span><h2>Watchlist</h2></div>
        <button className="group-add" onClick={addGroup}>+ Group</button>
      </div>
      <div className="watch-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbols" />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All stocks</option><option value="positions">Positions only</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="manual">Manual order</option><option value="change">% change</option><option value="pl">Profit / loss</option></select>
      </div>
      <div className="watch-columns"><span>Symbol</span><span>Price</span><span>% Chg</span></div>
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
                draggable={sort === 'manual'}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', symbol)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.stopPropagation(); moveSymbol(event.dataTransfer.getData('text/plain'), group.id, symbol) }}
                onClick={() => onSelect(symbol)}
                onKeyDown={(event) => { if (event.key === 'Enter') onSelect(symbol) }}
              >
                <span className="watch-symbol"><strong>{symbol}</strong><small>{item.error || (item.position.shares ? `${item.position.shares} shares · ${money(item.position.unrealizedPL, item.quote?.currency)}` : 'No position')}</small></span>
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
