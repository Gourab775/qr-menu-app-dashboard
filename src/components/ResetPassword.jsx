import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { IconLock, IconCheck } from '../components/Icons'

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('New password is required')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        console.error('[RESET] Update error:', updateError.message)
        setError(updateError.message)
      } else {
        console.log('[RESET] Password updated successfully')
        setSuccess(true)
        setTimeout(() => {
          onDone()
        }, 2000)
      }
    } catch (err) {
      console.error('[RESET] Fatal error:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-icon"><IconCheck size={48} /></div>
          <h1 className="login-title">Password Reset</h1>
          <p className="login-subtitle">Your password has been updated successfully!</p>
          <p style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
            Redirecting to login...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon"><IconLock size={48} /></div>
        <h1 className="login-title">Set New Password</h1>
        <p className="login-subtitle">Enter your new password below</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="login-input"
              autoFocus
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="login-input"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading || !password || !confirmPassword}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}