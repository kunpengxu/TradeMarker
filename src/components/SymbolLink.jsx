import { Link } from 'react-router-dom'

export default function SymbolLink({ symbol, children, className = '' }) {
  if (!symbol) return children || null
  const label = children || symbol
  return (
    <Link
      to={`/?symbol=${encodeURIComponent(symbol)}`}
      className={['symbol-inline-link', className].filter(Boolean).join(' ')}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  )
}
