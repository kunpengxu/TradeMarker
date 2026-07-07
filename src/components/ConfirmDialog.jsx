export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}) {
  return <div className="modal-backdrop" onMouseDown={onCancel}>
    <div className="modal confirm-dialog" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-button" onClick={onCancel}>×</button>
      </div>
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={danger ? 'danger-button' : ''} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
}
