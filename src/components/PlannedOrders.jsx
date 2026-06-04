import { dateTime, money, number } from '../utils/formatters'

export default function PlannedOrders({ orders, onUpdate, onDelete }) {
  if (!orders.length) return <div className="empty-inline">No planned orders yet.</div>
  return (
    <div className="table-wrap"><table><thead><tr><th>Side</th><th>Price</th><th>Shares</th><th>Status</th><th>Created</th><th>Note</th><th /></tr></thead>
      <tbody>{orders.map((order) => <tr key={order.id}><td><span className={`side ${order.side.toLowerCase()}`}>{order.side}</span></td><td>{money(order.price)}</td><td>{number(order.shares, 4)}</td>
        <td><select value={order.status} onChange={(e) => onUpdate({ ...order, status: e.target.value })}><option>OPEN</option><option>FILLED</option><option>CANCELLED</option></select></td>
        <td>{dateTime(order.createdAt)}</td><td>{order.note || '—'}</td><td><button className="text-button danger" onClick={() => onDelete(order.id)}>Delete</button></td></tr>)}</tbody>
    </table></div>
  )
}
