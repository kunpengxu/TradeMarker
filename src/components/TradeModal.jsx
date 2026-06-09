import { useState } from 'react'
import { EMOTION_TYPES, REASON_TYPES } from '../services/storage'
import { useI18n } from '../i18n'

const localDateTime = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  const value = now.toISOString()
  return { date: value.slice(0, 10), time: value.slice(11, 16) }
}

export default function TradeModal({ side, symbol, defaultPrice, candles = [], initialTrade, onClose, onSave }) {
  const { t } = useI18n()
  const initialDate = initialTrade ? new Date(initialTrade.date) : null
  if (initialDate) initialDate.setMinutes(initialDate.getMinutes() - initialDate.getTimezoneOffset())
  const initialDateTime = initialDate ? { date: initialDate.toISOString().slice(0, 10), time: initialDate.toISOString().slice(11, 16) } : localDateTime()
  const hasAdvanced = Boolean(initialTrade?.reasonType || initialTrade?.reasonTags?.length || initialTrade?.confidence || initialTrade?.targetPrice || initialTrade?.targets?.length || initialTrade?.stopLoss || initialTrade?.takeProfit || initialTrade?.thesis || initialTrade?.invalidation || initialTrade?.riskNote || initialTrade?.marketContext || initialTrade?.emotion)
  const [showAdvanced, setShowAdvanced] = useState(hasAdvanced)
  const initialTags = initialTrade?.reasonTags?.length ? initialTrade.reasonTags : initialTrade?.reasonType ? [initialTrade.reasonType] : []
  const initialTargets = initialTrade?.targets?.length ? initialTrade.targets : [initialTrade?.targetPrice, initialTrade?.takeProfit].filter((value, index, values) => value && values.indexOf(value) === index)
  const [form, setForm] = useState({
    price: initialTrade?.price ?? defaultPrice,
    shares: initialTrade?.shares ?? '',
    ...initialDateTime,
    note: initialTrade?.note || '',
    reasonTags: initialTags,
    confidence: initialTrade?.confidence ?? null,
    targetsInput: initialTargets.join(', '),
    stopLoss: initialTrade?.stopLoss ?? '',
    thesis: initialTrade?.thesis || '',
    invalidation: initialTrade?.invalidation || '',
    riskNote: initialTrade?.riskNote || '',
    marketContext: initialTrade?.marketContext || '',
    emotion: initialTrade?.emotion || '',
  })
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const toggleTag = (tag) => setForm((current) => ({
    ...current,
    reasonTags: current.reasonTags.includes(tag) ? current.reasonTags.filter((item) => item !== tag) : [...current.reasonTags, tag],
  }))
  const setConfidence = (score) => setForm((current) => ({ ...current, confidence: current.confidence === score ? null : score }))
  const setEmotion = (emotion) => setForm((current) => ({ ...current, emotion: current.emotion === emotion ? '' : emotion }))
  const matchingDates = candles
    .filter((candle) => {
      const price = Number(form.price)
      return Number.isFinite(price) && price >= Number(candle.low) && price <= Number(candle.high)
    })
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 5)
  const submit = (event) => {
    event.preventDefault()
    const { time, targetsInput, ...trade } = form
    const targets = form.targetsInput.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0)
    onSave({
      ...trade,
      id: initialTrade?.id,
      side,
      symbol,
      price: Number(form.price),
      shares: Number(form.shares),
      confidence: form.confidence == null || form.confidence === '' ? null : Number(form.confidence),
      reasonType: form.reasonTags[0] || '',
      targets,
      stopLoss: form.stopLoss === '' ? null : Number(form.stopLoss),
      date: new Date(`${form.date}T${time}`).toISOString(),
    })
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><h2>{initialTrade ? t('edit') : t('record')} {side}</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <p className="notice">{t('journalEntryOnly')}</p>
          <label>{t('symbol')}<input value={symbol} disabled /></label>
          <div className="form-row"><label>{t('price')}<input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={update} required /></label><label>{t('shares')}<input name="shares" type="number" min="0.0001" step="any" value={form.shares} onChange={update} required /></label></div>
          {matchingDates.length > 0 && <div className="price-date-suggestions"><span>{t('datesWherePriceTraded')}</span>{matchingDates.map((candle) => <button type="button" key={candle.time} onClick={() => setForm({ ...form, date: candle.time })}><strong>{candle.time}</strong><small>{t('low')} {Number(candle.low).toFixed(2)} · {t('high')} {Number(candle.high).toFixed(2)} · {t('close')} {Number(candle.close).toFixed(2)}</small></button>)}</div>}
          <div className="form-row"><label>{t('date')}<input name="date" type="date" value={form.date} onChange={update} required /></label><label>{t('time')}<input name="time" type="time" value={form.time} onChange={update} required /></label></div>
          <label>{t('note')}<textarea name="note" value={form.note} onChange={update} placeholder={t('optionalJournalNote')} /></label>
          <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced((current) => !current)}>{showAdvanced ? t('hideAdvancedJournal') : t('showAdvancedJournal')}</button>
          {showAdvanced && <div className="advanced-journal">
            <label>{t('reasonTags')}<div className="chip-grid">{REASON_TYPES.map((reason) => <button type="button" key={reason} className={form.reasonTags.includes(reason) ? 'chip selected' : 'chip'} onClick={() => toggleTag(reason)}>{reason}</button>)}</div></label>
            <label>{t('confidence')}<div className="star-rating"><button type="button" className="clear-rating" onClick={() => setConfidence(null)}>{t('notSet')}</button>{[1, 2, 3, 4, 5].map((score) => <button type="button" key={score} className={score <= Number(form.confidence || 0) ? 'filled' : ''} onClick={() => setConfidence(score)} aria-label={`${t('confidence')} ${score}`}>{score <= Number(form.confidence || 0) ? '★' : '☆'}</button>)}</div></label>
            <label>{t('emotion')}<div className="chip-grid">{EMOTION_TYPES.map((emotion) => <button type="button" key={emotion} className={form.emotion === emotion ? 'chip selected emotion-chip' : 'chip emotion-chip'} onClick={() => setEmotion(emotion)}>{emotion}</button>)}</div></label>
            <div className="form-row"><label>{t('targetPrices')}<input name="targetsInput" value={form.targetsInput} onChange={update} placeholder="15.5, 16.5, 18" /></label><label>{t('stopLoss')}<input name="stopLoss" type="number" min="0" step="0.01" value={form.stopLoss} onChange={update} /></label></div>
            <label>{t('marketContext')}<textarea name="marketContext" value={form.marketContext} onChange={update} placeholder={t('marketContextPlaceholder')} /></label>
            <label>{t('tradeThesis')}<textarea name="thesis" value={form.thesis} onChange={update} placeholder={t('tradeThesisPlaceholder')} /></label>
            <label>{t('invalidationCondition')}<textarea name="invalidation" value={form.invalidation} onChange={update} placeholder={t('invalidationPlaceholder')} /></label>
            <label>{t('riskNote')}<textarea name="riskNote" value={form.riskNote} onChange={update} placeholder={t('riskNotePlaceholder')} /></label>
          </div>}
        </div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>{t('cancel')}</button><button type="submit">{t('saveJournalEntry')}</button></div>
      </form>
    </div>
  )
}
