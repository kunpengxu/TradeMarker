import { CHART_INDICATOR_OPTIONS, DEFAULT_CHART_INDICATORS } from '../hooks/useChartIndicators'
import { useI18n } from '../i18n'

export default function IndicatorMenu({ value, onChange }) {
  const { t } = useI18n()
  const indicators = { ...DEFAULT_CHART_INDICATORS, ...value }
  const toggle = (key) => onChange({ ...indicators, [key]: !indicators[key] })
  const setAll = (enabled) => onChange(Object.fromEntries(CHART_INDICATOR_OPTIONS.map((option) => [option.key, enabled])))
  const activeCount = CHART_INDICATOR_OPTIONS.filter((option) => indicators[option.key]).length

  return (
    <details className="indicator-menu">
      <summary>{t('indicators')} <span>{activeCount}</span></summary>
      <div className="indicator-menu-panel">
        <div className="indicator-menu-actions">
          <button type="button" onClick={() => setAll(true)}>{t('allIndicators')}</button>
          <button type="button" onClick={() => setAll(false)}>{t('clearIndicators')}</button>
        </div>
        {CHART_INDICATOR_OPTIONS.map((option) => (
          <label key={option.key}>
            <input type="checkbox" checked={Boolean(indicators[option.key])} onChange={() => toggle(option.key)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  )
}
