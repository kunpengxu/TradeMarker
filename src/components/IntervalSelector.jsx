const intervals = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

export default function IntervalSelector({ value, onChange }) {
  return (
    <div className="intervals">
      {intervals.map((interval) => (
        <button key={interval} className={value === interval ? 'active' : ''} onClick={() => onChange(interval)}>
          {interval[0].toUpperCase() + interval.slice(1)}
        </button>
      ))}
    </div>
  )
}
