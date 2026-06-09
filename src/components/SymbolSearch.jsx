import { useEffect, useRef, useState } from 'react'
import { searchSymbols } from '../services/marketData'
import { useI18n } from '../i18n'

export default function SymbolSearch({ onSelect }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    if (query.trim().length < 2) { setResults([]); setError(''); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const next = await searchSymbols(query)
        if (id === requestId.current) { setResults(next); setError('') }
      } catch (requestError) {
        if (id === requestId.current) { setResults([]); setError(requestError.message) }
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const choose = async (result) => {
    await onSelect(result.symbol)
    setQuery('')
    setResults([])
  }

  return (
    <div className="symbol-search">
      <div className="workspace-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchSymbolPlaceholder')} aria-label={t('searchSymbolAria')} /><span className="search-state">{loading ? '…' : ''}</span></div>
      {(results.length > 0 || error) && <div className="symbol-results">
        {error ? <p className="search-error">{error}</p> : results.map((result) => <button key={`${result.symbol}-${result.exchange}`} onClick={() => choose(result)}><strong>{result.symbol}</strong><span>{result.name}</span><small>{result.exchange} · {result.type}</small></button>)}
      </div>}
    </div>
  )
}
