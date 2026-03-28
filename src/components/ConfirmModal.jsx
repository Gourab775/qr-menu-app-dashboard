export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Delete', loading = false }) {
  if (!isOpen) return null

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-modal-icon">
          <span>⚠️</span>
        </div>
        <h3 className="confirm-modal-title">{title}</h3>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button 
            className="confirm-cancel-btn"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            className="confirm-delete-btn"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Deleting...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
