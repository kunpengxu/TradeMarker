import { useState } from 'react'

const localDateTime = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

export default function TradeModal({ side, symbol, defaultPrice, onClose, onSave }) {
  const [form, setForm] = useState({ price: defaultPrice, shares: '', date: localDateTime(), note: '' })
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = (event) => {
    event.preventDefault()
    onSave({ ...form, side, symbol, price: Number(form.price), shares: Number(form.shares), date: new Date(form.date).toISOString() })
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><h2>Record {side}</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
        <p className="notice">Journal entry only. This will not place or execute an order.</p>
        <label>Symbol<input value={symbol} disabled /></label>
        <div className="form-row"><label>Price<input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={update} required /></label><label>Shares<input name="shares" type="number" min="0.0001" step="any" value={form.shares} onChange={update} required /></label></div>
        <label>Date and time<input name="date" type="datetime-local" value={form.date} onChange={update} required /></label>
        <label>Note<textarea name="note" value={form.note} onChange={update} placeholder="Optional journal note" /></label>
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit">Save journal entry</button></div>
      </form>
    </div>
  )
}
