import { useEffect, useMemo, useRef, useState } from 'react'
import OrderPlanCard from './OrderPlanCard'
import Sparkline from './Sparkline'
import { getWatchlistGroups, saveWatchlistGroups } from '../services/storage'
import { money, percent, valueClass } from '../utils/formatters'
import { useI18n } from '../i18n'

const cleanSymbol = (value) => String(value || '').toUpperCase().replace(/(:CA|:US)$/i, '').replace(/\.(NE|TO|V)$/i, '')
const matchesSymbol = (first, second) => {
  const left = String(first || '').toUpperCase()
  const right = String(second || '').toUpperCase()
  return left === right || cleanSymbol(left) === cleanSymbol(right)
}
const presetGroupLabelKey = (id) => ({
  'long-core': 'groupLongCore',
  'long-satellite': 'groupLongSatellite',
  swing: 'groupSwing',
  'leveraged-swing': 'groupLeveragedSwing',
})[id]

export default function WatchlistSidebar({ items, selected, onSelect, onRemove, orderSymbols = [], orderPlans = [], sparklines = {} }) {
  const { t } = useI18n()
  const sidebarRef = useRef(null)
  const hidePopoverTimer = useRef(null)
  const [groups, setGroups] = useState(getWatchlistGroups)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'manual', direction: 'desc' })
  const [orderPopover, setOrderPopover] = useState(null)
  const [managingGroups, setManagingGroups] = useState(false)

  useEffect(() => setGroups(getWatchlistGroups()), [items])
  useEffect(() => () => window.clearTimeout(hidePopoverTimer.current), [])
  const itemMap = useMemo(() => new Map(items.map((item) => [item.symbol, item])), [items])
  const allOrderSymbols = useMemo(() => orderPlans.length ? orderPlans.map((order) => order.symbol).filter(Boolean) : orderSymbols, [orderPlans, orderSymbols])
  const orderSymbolSet = useMemo(() => new Set(allOrderSymbols.flatMap((symbol) => [String(symbol).toUpperCase(), cleanSymbol(symbol)])), [allOrderSymbols])
  const orderRowsBySymbol = useMemo(() => new Map(items.map((item) => [
    item.symbol,
    orderPlans.filter((order) => matchesSymbol(order.symbol, item.symbol)),
  ])), [items, orderPlans])
  const ordersForSymbol = (symbol) => orderRowsBySymbol.get(symbol) || []
  const orderCount = (symbol) => orderPlans.length
    ? ordersForSymbol(symbol).length
    : orderSymbols.filter((orderSymbol) => matchesSymbol(orderSymbol, symbol)).length
  const showOrderPopover = (event, symbol) => {
    event.stopPropagation()
    window.clearTimeout(hidePopoverTimer.current)
    const buttonBox = event.currentTarget.getBoundingClientRect()
    const sidebarBox = sidebarRef.current?.getBoundingClientRect()
    const top = sidebarBox ? Math.max(8, Math.min(buttonBox.top - sidebarBox.top - 18, window.innerHeight - sidebarBox.top - 270)) : 100
    setOrderPopover({ symbol, top })
  }
  const scheduleHideOrderPopover = () => {
    window.clearTimeout(hidePopoverTimer.current)
    hidePopoverTimer.current = window.setTimeout(() => setOrderPopover(null), 120)
  }
  const visible = (symbol) => {
    const item = itemMap.get(symbol)
    if (!item || !symbol.toLowerCase().includes(query.toLowerCase())) return false
    if (filter.startsWith('group:')) {
      const groupId = filter.slice(6)
      return groups.find((group) => group.id === groupId)?.symbols.includes(symbol)
    }
    if (filter === 'positions') return item.position.shares > 0
    if (filter === 'orders') return orderSymbolSet.has(String(symbol).toUpperCase()) || orderSymbolSet.has(cleanSymbol(symbol))
    if (filter === 'gainers') return Number(item.quote?.changePercent) > 0
    if (filter === 'losers') return Number(item.quote?.changePercent) < 0
    if (filter === 'big-gainers') return Number(item.quote?.changePercent) >= 5
    if (filter === 'big-losers') return Number(item.quote?.changePercent) <= -5
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
  const groupLabel = (group) => {
    const key = presetGroupLabelKey(group.id)
    return key ? t(key) : group.name
  }
  const filteredSymbols = groups.flatMap((group) => group.symbols.filter(visible))
  const summaryGroup = filter.startsWith('group:')
    ? groupLabel(groups.find((group) => group.id === filter.slice(6)) || { name: t('allStocks') })
    : filter === 'all' ? t('allStocks')
      : filter === 'positions' ? t('positionsOnly')
        : filter === 'orders' ? t('withOrderSuggestions')
          : filter === 'gainers' ? t('gainers')
            : filter === 'losers' ? t('losers')
              : filter === 'big-gainers' ? t('bigGainers')
                : filter === 'big-losers' ? t('bigLosers')
                  : t('allStocks')
  const summaryPositions = filteredSymbols.filter((symbol) => (itemMap.get(symbol)?.position?.shares || 0) > 0).length
  const summaryOrders = filteredSymbols.filter((symbol) => orderCount(symbol)).length
  const groupStats = (symbols) => {
    const rows = symbols.map((symbol) => itemMap.get(symbol)).filter(Boolean)
    const positioned = rows.filter((item) => (item.position?.shares || 0) > 0)
    const marketValue = positioned.reduce((sum, item) => sum + (item.position?.marketValue || 0), 0)
    const unrealizedPL = positioned.reduce((sum, item) => sum + (item.position?.unrealizedPL || 0), 0)
    const currencies = [...new Set(positioned.map((item) => item.quote?.currency).filter(Boolean))]
    return {
      positions: positioned.length,
      gainers: rows.filter((item) => Number(item.quote?.changePercent) > 0).length,
      losers: rows.filter((item) => Number(item.quote?.changePercent) < 0).length,
      marketValue,
      unrealizedPL,
      currency: currencies.length === 1 ? currencies[0] : null,
    }
  }
  const renameGroup = (group) => {
    const name = prompt(t('renameGroup'), group.name)
    if (name?.trim()) persist(groups.map((item) => item.id === group.id ? { ...item, name: name.trim() } : item))
  }
  const deleteEmptyGroup = (group) => {
    if (!group.symbols.length) persist(groups.filter((item) => item.id !== group.id))
  }

  return (
    <aside className="market-sidebar" ref={sidebarRef}>
      <div className="sidebar-title">
        <div><span className="eyebrow">{t('personalList')}</span><h2>{t('watchlist')}</h2></div>
        <button className="group-add" onClick={addGroup}>{t('addGroup')}</button>
      </div>
      <div className="watch-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('filterSymbols')} />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{t('allStocks')}</option><option value="positions">{t('positionsOnly')}</option><option value="orders">{t('withOrderSuggestions')}</option><option value="gainers">{t('gainers')}</option><option value="losers">{t('losers')}</option><option value="big-gainers">{t('bigGainers')}</option><option value="big-losers">{t('bigLosers')}</option>{groups.map((group) => <option value={`group:${group.id}`} key={group.id}>{groupLabel(group)}</option>)}</select>
        <select value={sort.key} onChange={(event) => setSort({ key: event.target.value, direction: 'desc' })}><option value="manual">{t('manualOrder')}</option><option value="change">{t('percentChange')}</option><option value="pl">{t('profitLoss')}</option></select>
        <button type="button" className="manage-groups-button" onClick={() => setManagingGroups(true)}>{t('manageGroups')}</button>
      </div>
      <p className="watch-filter-summary">{t('watchlistSummary', { group: summaryGroup, count: filteredSymbols.length, positions: summaryPositions, orders: summaryOrders })}</p>
      <div className="watch-columns"><button onClick={() => toggleSort('symbol')}>{t('symbol')}{sortArrow('symbol')}</button><span /> <button onClick={() => toggleSort('price')}>{t('price')}{sortArrow('price')}</button><button onClick={() => toggleSort('change')}>{t('percentChange')}{sortArrow('change')}</button></div>
      <div className="watch-rows">
        {groups.map((group) => {
          const symbols = sortSymbols(group.symbols.filter(visible))
          const stats = groupStats(symbols)
          return <section className="watch-group" key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveSymbol(event.dataTransfer.getData('text/plain'), group.id)}>
            <div className="watch-group-head"><strong>{groupLabel(group)}</strong><span>{symbols.length}</span></div>
            {symbols.length ? <div className="watch-group-stats">
              <span>{t('openPositions')} {stats.positions}</span>
              <span className={valueClass(stats.unrealizedPL)}>{stats.currency ? money(stats.unrealizedPL, stats.currency) : t('mixed')}</span>
              <span>{stats.gainers}↑ {stats.losers}↓</span>
            </div> : null}
            {symbols.map((symbol) => {
              const item = itemMap.get(symbol)
              const orders = orderCount(symbol)
              return <div
                className={`watch-row ${selected === symbol ? 'selected' : ''} ${orders ? 'has-orders' : ''} ${valueClass(item.position?.unrealizedPL || item.quote?.change)}`}
                key={symbol}
                role="button"
                tabIndex="0"
                draggable={sort.key === 'manual'}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', symbol)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.stopPropagation(); moveSymbol(event.dataTransfer.getData('text/plain'), group.id, symbol) }}
                onClick={() => { setOrderPopover(null); onSelect(symbol) }}
                onKeyDown={(event) => { if (event.key === 'Enter') { setOrderPopover(null); onSelect(symbol) } }}
              >
                <span className="watch-symbol"><strong>{symbol}{orders ? <button
                  type="button"
                  className="watch-order-badge"
                  onMouseEnter={(event) => showOrderPopover(event, symbol)}
                  onMouseLeave={scheduleHideOrderPopover}
                  onFocus={(event) => showOrderPopover(event, symbol)}
                  onBlur={scheduleHideOrderPopover}
                  onClick={(event) => event.stopPropagation()}
                >{orders} {t('orderShort')}</button> : null}</strong><small>{item.error || (item.position.shares ? `${item.position.shares} ${t('shares').toLowerCase()} · ${money(item.position.unrealizedPL, item.quote?.currency)}` : t('noPosition'))}</small></span>
                <Sparkline rows={sparklines[symbol]} change={item.quote?.change || 0} />
                <strong className={valueClass(item.quote?.change)}>{item.quote ? money(item.quote.price, item.quote.currency) : '—'}</strong>
                <strong className={valueClass(item.quote?.change)}>{item.quote ? percent(item.quote.changePercent) : '—'}</strong>
                <select className="watch-group-select" value={group.id} onClick={(event) => event.stopPropagation()} onChange={(event) => moveSymbol(symbol, event.target.value)}>
                  {groups.map((option) => <option key={option.id} value={option.id}>{groupLabel(option)}</option>)}
                </select>
                <button className="remove-watch" onClick={(event) => { event.stopPropagation(); setOrderPopover(null); onRemove(symbol) }}>×</button>
              </div>
            })}
          </section>
        })}
      </div>
      {orderPopover?.symbol && ordersForSymbol(orderPopover.symbol).length ? <div
        className="watch-order-popover"
        style={{ top: orderPopover.top }}
        onMouseEnter={() => window.clearTimeout(hidePopoverTimer.current)}
        onMouseLeave={scheduleHideOrderPopover}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="watch-order-popover-head">
          <strong>{t('orderSuggestionsFor', { symbol: orderPopover.symbol })}</strong>
          <button type="button" onClick={() => setOrderPopover(null)}>×</button>
        </div>
        <div className="watch-order-popover-body">
          {ordersForSymbol(orderPopover.symbol).map((order) => <OrderPlanCard order={order} key={order.id} />)}
        </div>
      </div> : null}
      {managingGroups ? <div className="modal-backdrop" onMouseDown={() => setManagingGroups(false)}>
        <div className="modal group-manager-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-head"><h2>{t('manageGroups')}</h2><button type="button" className="icon-button" onClick={() => setManagingGroups(false)}>×</button></div>
          <div className="modal-body group-manager-list">
            {groups.map((group, index) => <div className="group-manager-row" key={group.id}>
              <strong>{groupLabel(group)}</strong><span>{group.symbols.length}</span>
              <button type="button" className="secondary" onClick={() => renameGroup(group)}>{t('renameGroup')}</button>
              <button type="button" className="secondary" disabled={index === 0} onClick={() => { const next = [...groups]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; persist(next) }}>↑</button>
              <button type="button" className="secondary" disabled={index === groups.length - 1} onClick={() => { const next = [...groups]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; persist(next) }}>↓</button>
              <button type="button" className="danger-button" disabled={group.symbols.length > 0} onClick={() => deleteEmptyGroup(group)}>{t('deleteEmptyGroup')}</button>
            </div>)}
          </div>
        </div>
      </div> : null}
    </aside>
  )
}
