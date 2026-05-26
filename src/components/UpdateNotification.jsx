import { IconX } from './Icons'

export default function UpdateNotification({ update, onUpdate, onDismiss }) {
  if (!update) return null

  return (
    <div className="update-modal-overlay" onClick={update.force_update ? undefined : onDismiss}>
      <div className="update-modal" onClick={e => e.stopPropagation()}>
        <div className="update-modal-header">
          <div className="update-modal-icon">
            <span role="img" aria-label="rocket">🚀</span>
          </div>
          <h3 className="update-modal-title">New Update Available</h3>
          {!update.force_update && (
            <button className="update-modal-close" onClick={onDismiss}>
              <IconX size={20} />
            </button>
          )}
        </div>

        <div className="update-modal-body">
          <div className="update-version-row">
            <span className="update-label">Version</span>
            <span className="update-version">{update.version}</span>
          </div>

          {update.message && (
            <div className="update-message">{update.message}</div>
          )}

          {update.changelog && (
            <div className="update-changelog">
              <span className="update-label">What's New</span>
              <div className="update-changelog-content">{update.changelog}</div>
            </div>
          )}
        </div>

        <div className="update-modal-actions">
          <button
            className="update-btn update-btn-primary"
            onClick={() => onUpdate(update.update_url)}
          >
            Update Now
          </button>
          {!update.force_update && (
            <button className="update-btn update-btn-secondary" onClick={onDismiss}>
              Later
            </button>
          )}
        </div>

        {update.force_update && (
          <div className="update-force-text">
            This update is required to continue using the dashboard
          </div>
        )}
      </div>
    </div>
  )
}
