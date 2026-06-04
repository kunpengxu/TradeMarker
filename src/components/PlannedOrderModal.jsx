import { useState } from 'react'

export default function PlannedOrderModal({ symbol, defaultPrice, onClose, onSave }) {
  const [form, setForm] = useState({ side: 'BUY', price: defaultPrice, shares: '', status: 'OPEN', note: '' })
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = (event) => {
    event.preventDefault()
    onSave({ ...form, symbol, price: Number(form.price), shares: Number(form.shares), createdAt: new Date().toISOString() })
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><h2>Add planned order</h2><button type="button" className="icon-button" onClick={onClose}>×</button></div>
      <p className="notice">Planning note only. No order will be sent anywhere.</p>
      <div className="form-row"><label>Side<select name="side" value={form.side} onChange={update}><option>BUY</option><option>SELL</option></select></label><label>Status<select name="status" value={form.status} onChange={update}><option>OPEN</option><option>FILLED</option><option>CANCELLED</option></select></label></div>
      <div className="form-row"><label>Price<input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={update} required /></label><label>Shares<input name="shares" type="number" min="0.0001" step="any" value={form.shares} onChange={update} required /></label></div>
      <label>Note<textarea name="note" value={form.note} onChange={update} /></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit">Save planned note</button></div>
    </form></div>
  )
}
