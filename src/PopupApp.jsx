import React from 'react'
import { useAuth } from './contexts/AuthContext'
import FloatingOrderPopup from './components/FloatingOrderPopup'
import './PopupApp.css'

function PopupApp() {
  const { session, loading: authLoading, initialized } = useAuth()

  if (!session && !authLoading) {
    return (
      <div className="popup-shell">
        <div className="popup-center-message">
          <p>Please log in to view orders</p>
        </div>
      </div>
    )
  }

  if (authLoading || !initialized) {
    return (
      <div className="popup-shell">
        <div className="popup-center-message">
          <div className="popup-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="popup-shell">
      <FloatingOrderPopup standalone />
    </div>
  )
}

export default PopupApp
