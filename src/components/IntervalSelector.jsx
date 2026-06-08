const intervals = [
  { value: '1m', label: '1m' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

export default function IntervalSelector({ value, onChange }) {
  return (
    <div className="intervals">
      {intervals.map((interval) => (
        <button key={interval.value} className={value === interval.value ? 'active' : ''} onClick={() => onChange(interval.value)}>
          {interval.label}
        </button>
      ))}
    </div>
  )
}
