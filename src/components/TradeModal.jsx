import { useState } from 'react'

const localDateTime = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  const value = now.toISOString()
  return { date: value.slice(0, 10), time: value.slice(11, 16) }
}

export default function TradeModal({ side, symbol, defaultPrice, initialTrade, onClose, onSave }) {
  const initialDate = initialTrade ? new Date(initialTrade.date) : null
  if (initialDate) initialDate.setMinutes(initialDate.getMinutes() - initialDate.getTimezoneOffset())
  const initialDateTime = initialDate ? { date: initialDate.toISOString().slice(0, 10), time: initialDate.toISOString().slice(11, 16) } : localDateTime()
  const [form, setForm] = useState({ price: initialTrade?.price ?? defaultPrice, shares: initialTrade?.shares ?? '', ...initialDateTime, note: initialTrade?.note || '' })
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = (event) => {
    event.preventDefault()
    const { time, ...trade } = form
    onSave({ ...trade, id: initialTrade?.id, side, symbol, price: Number(form.price), shares: Number(form.shares), date: new Date(`${form.date}T${time}`).toISOString() })
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><h2>{initialTrade ? 'Edit' : 'Record'} {side}</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <p className="notice">Journal entry only. This will not place or execute an order.</p>
        <label>Symbol<input value={symbol} disabled /></label>
        <div className="form-row"><label>Price<input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={update} required /></label><label>Shares<input name="shares" type="number" min="0.0001" step="any" value={form.shares} onChange={update} required /></label></div>
        <div className="form-row"><label>Date<input name="date" type="date" value={form.date} onChange={update} required /></label><label>Time<input name="time" type="time" value={form.time} onChange={update} required /></label></div>
        <label>Note<textarea name="note" value={form.note} onChange={update} placeholder="Optional journal note" /></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit">Save journal entry</button></div>
      </form>
    </div>
  )
}
