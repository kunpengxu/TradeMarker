import { useI18n } from '../i18n'

const intervals = [
  { value: '1m', labelKey: null, fallback: '1m' },
  { value: 'daily', labelKey: 'daily' },
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'monthly', labelKey: 'monthly' },
  { value: 'quarterly', labelKey: 'quarterly' },
  { value: 'yearly', labelKey: 'yearly' },
]

export default function IntervalSelector({ value, onChange }) {
  const { t } = useI18n()
  return (
    <div className="intervals">
      {intervals.map((interval) => (
        <button key={interval.value} className={value === interval.value ? 'active' : ''} onClick={() => onChange(interval.value)}>
          {interval.labelKey ? t(interval.labelKey) : interval.fallback}
        </button>
      ))}
    </div>
  )
}
