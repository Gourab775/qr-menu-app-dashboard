import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconDollarSign, IconPlus, IconX } from '../Icons'
import { formatOrderDateTime } from '../../utils/formatDateTime'
import { useFormatCurrency } from '../../hooks/useFormatCurrency'

const API_TIMEOUT = 30000

export default function PosCashManagement({ restaurantId }) {
  const formatCurrency = useFormatCurrency()
  const [shifts, setShifts] = useState([])
  const [activeShift, setActiveShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showOpenShift, setShowOpenShift] = useState(false)
  const [openingBalance, setOpeningBalance] = useState('')
  const [showCloseShift, setShowCloseShift] = useState(false)
  const [closingBalance, setClosingBalance] = useState('')
  const [showCashIn, setShowCashIn] = useState(false)
  const [showCashOut, setShowCashOut] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [cashReason, setCashReason] = useState('')
  const [todaySales, setTodaySales] = useState(0)
  const [todayCashSales, setTodayCashSales] = useState(0)

  const mountedRef = useRef(false)

  const SHIFTS_KEY = `pos_shifts_${restaurantId}`
  const CASH_LOG_KEY = `pos_cash_log_${restaurantId}`

  useEffect(() => {
    mountedRef.current = true
    loadData()
    return () => { mountedRef.current = false }
  }, [restaurantId])

  const loadData = async () => {
    setLoading(true)
    try {
      const stored = localStorage.getItem(SHIFTS_KEY)
      const shiftsData = stored ? JSON.parse(stored) : []
      setShifts(shiftsData)
      const open = shiftsData.find(s => s.status === 'open')
      setActiveShift(open || null)

      const startOfDay = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
      const { data } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('total_price, note')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .eq('status', 'completed')
          .gte('created_at', startOfDay)
          .lte('created_at', new Date().toISOString()),
        API_TIMEOUT
      )
      if (!mountedRef.current) return
      const orders = data || []
      const total = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
      const cashTotal = orders.reduce((s, o) => {
        if (o.note?.includes('CASH')) return s + (Number(o.total_price) || 0)
        return s
      }, 0)
      setTodaySales(total)
      setTodayCashSales(cashTotal)
    } catch (err) {
      console.error('Failed to load cash data:', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const saveShifts = (updatedShifts) => {
    try {
      localStorage.setItem(SHIFTS_KEY, JSON.stringify(updatedShifts))
      setShifts(updatedShifts)
      const open = updatedShifts.find(s => s.status === 'open')
      setActiveShift(open || null)
    } catch {}
  }

  const handleOpenShift = (e) => {
    e.preventDefault()
    const balance = Number(openingBalance) || 0
    const newShift = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingBalance: balance,
      closingBalance: 0,
      cashIn: [],
      cashOut: [],
      status: 'open',
    }
    saveShifts([...shifts, newShift])
    setShowOpenShift(false)
    setOpeningBalance('')
  }

  const handleCloseShift = (e) => {
    e.preventDefault()
    const balance = Number(closingBalance) || 0
    const updated = shifts.map(s => {
      if (s.id === activeShift?.id) {
        return {
          ...s,
          closedAt: new Date().toISOString(),
          closingBalance: balance,
          status: 'closed',
        }
      }
      return s
    })
    saveShifts(updated)
    setShowCloseShift(false)
    setClosingBalance('')
  }

  const handleCashIn = (e) => {
    e.preventDefault()
    if (!activeShift || !Number(cashAmount)) return
    const entry = { id: Date.now().toString(36), amount: Number(cashAmount), reason: cashReason || 'Cash In', createdAt: new Date().toISOString() }
    const updated = shifts.map(s => {
      if (s.id === activeShift.id) {
        return { ...s, cashIn: [...s.cashIn, entry] }
      }
      return s
    })
    saveShifts(updated)
    setShowCashIn(false)
    setCashAmount('')
    setCashReason('')
  }

  const handleCashOut = (e) => {
    e.preventDefault()
    if (!activeShift || !Number(cashAmount)) return
    const entry = { id: Date.now().toString(36), amount: Number(cashAmount), reason: cashReason || 'Cash Out', createdAt: new Date().toISOString() }
    const updated = shifts.map(s => {
      if (s.id === activeShift.id) {
        return { ...s, cashOut: [...s.cashOut, entry] }
      }
      return s
    })
    saveShifts(updated)
    setShowCashOut(false)
    setCashAmount('')
    setCashReason('')
  }

  const shiftCashInTotal = useMemo(() => {
    if (!activeShift) return 0
    return (activeShift.cashIn || []).reduce((s, e) => s + (e.amount || 0), 0)
  }, [activeShift])

  const shiftCashOutTotal = useMemo(() => {
    if (!activeShift) return 0
    return (activeShift.cashOut || []).reduce((s, e) => s + (e.amount || 0), 0)
  }, [activeShift])

  const closedShifts = shifts.filter(s => s.status === 'closed').slice(0, 20)

  if (loading) {
    return (
      <div className="pos-cash-page">
        <div className="pos-loading">
          <div className="loading-spinner"></div>
          <p>Loading cash data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-cash-page">
      <div className="pos-cash-header">
        <h2>Cash Management</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <div className="pos-cash-grid">
        <div className="pos-cash-card">
          <div className="pos-cash-card-label">Today's Total Sales</div>
          <div className="pos-cash-card-value primary">{formatCurrency(todaySales)}</div>
        </div>
        <div className="pos-cash-card">
          <div className="pos-cash-card-label">Cash Sales</div>
          <div className="pos-cash-card-value green">{formatCurrency(todayCashSales)}</div>
        </div>
        <div className="pos-cash-card">
          <div className="pos-cash-card-label">Other Payments</div>
          <div className="pos-cash-card-value blue">{formatCurrency(todaySales - todayCashSales)}</div>
        </div>
      </div>

      <div className="pos-cash-section">
        <div className="pos-cash-section-header">
          <h3>{activeShift ? 'Active Shift' : 'No Active Shift'}</h3>
          {!activeShift ? (
            <button className="pos-cash-action-btn primary" onClick={() => setShowOpenShift(true)}>
              Open Shift
            </button>
          ) : (
            <button className="pos-cash-action-btn danger" onClick={() => setShowCloseShift(true)}>
              Close Shift
            </button>
          )}
        </div>

        {activeShift ? (
          <div className="pos-cash-shift-card">
            <div className="pos-cash-shift-detail">
              <span>Opened</span>
              <span>{formatOrderDateTime(activeShift.openedAt)}</span>
            </div>
            <div className="pos-cash-shift-detail">
              <span>Opening Balance</span>
              <span>{formatCurrency(activeShift.openingBalance)}</span>
            </div>
            <div className="pos-cash-shift-detail">
              <span>Cash In</span>
              <span className="green">{formatCurrency(shiftCashInTotal)}</span>
            </div>
            <div className="pos-cash-shift-detail">
              <span>Cash Out</span>
              <span className="red">{formatCurrency(shiftCashOutTotal)}</span>
            </div>
            <div className="pos-cash-shift-detail">
              <span>Expected Cash</span>
              <span className="primary" style={{ fontWeight: 700, fontSize: 16 }}>
                {formatCurrency(activeShift.openingBalance + shiftCashInTotal - shiftCashOutTotal + todayCashSales)}
              </span>
            </div>
          </div>
        ) : (
          <div className="pos-empty" style={{ padding: '24px' }}>
            <IconDollarSign size={32} />
            <span>No active shift</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Open a shift to start cash tracking</span>
          </div>
        )}

        {activeShift && (
          <div className="pos-cash-log-actions">
            <button className="pos-cash-action-btn success" onClick={() => setShowCashIn(true)}>
              <IconPlus size={14} /> Cash In
            </button>
            <button className="pos-cash-action-btn warning" onClick={() => setShowCashOut(true)}>
              <IconX size={14} /> Cash Out
            </button>
          </div>
        )}

        {activeShift && (activeShift.cashIn?.length > 0 || activeShift.cashOut?.length > 0) && (
          <div className="pos-cash-log-list">
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Cash Log</h4>
            {[...(activeShift.cashIn || []).map(e => ({ ...e, type: 'in' })), ...(activeShift.cashOut || []).map(e => ({ ...e, type: 'out' }))]
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .map(entry => (
                <div key={entry.id} className={`pos-cash-log-row ${entry.type === 'in' ? 'cash-in' : 'cash-out'}`}>
                  <div className="pos-cash-log-info">
                    <span className="pos-cash-log-reason">{entry.reason}</span>
                    <span className="pos-cash-log-time">{formatOrderDateTime(entry.createdAt)}</span>
                  </div>
                  <span className={`pos-cash-log-amount ${entry.type === 'in' ? 'green' : 'red'}`}>
                    {entry.type === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {closedShifts.length > 0 && (
        <div className="pos-cash-section">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Recent Shifts</h3>
          <div className="pos-cash-shift-history">
            {closedShifts.map(s => {
              const totalIn = (s.cashIn || []).reduce((sum, e) => sum + (e.amount || 0), 0)
              const totalOut = (s.cashOut || []).reduce((sum, e) => sum + (e.amount || 0), 0)
              return (
                <div key={s.id} className="pos-cash-shift-hist-row">
                  <div className="pos-cash-shift-hist-info">
                    <span>{formatOrderDateTime(s.openedAt)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→ {formatOrderDateTime(s.closedAt)}</span>
                  </div>
                  <div className="pos-cash-shift-hist-nums">
                    <span>Open: {formatCurrency(s.openingBalance)}</span>
                    <span>Close: {formatCurrency(s.closingBalance)}</span>
                    <span>In: {formatCurrency(totalIn)}</span>
                    <span>Out: {formatCurrency(totalOut)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showOpenShift && (
        <div className="pos-table-modal-overlay" onClick={() => setShowOpenShift(false)}>
          <div className="pos-table-modal" onClick={e => e.stopPropagation()}>
            <h3>Open Shift</h3>
            <form onSubmit={handleOpenShift}>
              <div className="pos-cash-form-group">
                <label>Opening Balance</label>
                <input type="number" placeholder="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} autoFocus min="0" />
              </div>
              <div className="pos-table-modal-actions">
                <button type="submit" className="btn-sm primary">Open Shift</button>
                <button type="button" className="btn-sm" onClick={() => setShowOpenShift(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCloseShift && (
        <div className="pos-table-modal-overlay" onClick={() => setShowCloseShift(false)}>
          <div className="pos-table-modal" onClick={e => e.stopPropagation()}>
            <h3>Close Shift</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Enter the final cash amount in the drawer
            </p>
            <form onSubmit={handleCloseShift}>
              <div className="pos-cash-form-group">
                <label>Closing Cash Balance</label>
                <input type="number" placeholder="0" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} autoFocus min="0" />
              </div>
              <div className="pos-table-modal-actions">
                <button type="submit" className="btn-sm primary">Close Shift</button>
                <button type="button" className="btn-sm" onClick={() => setShowCloseShift(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCashIn && (
        <div className="pos-table-modal-overlay" onClick={() => setShowCashIn(false)}>
          <div className="pos-table-modal" onClick={e => e.stopPropagation()}>
            <h3>Cash In</h3>
            <form onSubmit={handleCashIn}>
              <div className="pos-cash-form-group">
                <label>Amount</label>
                <input type="number" placeholder="0" value={cashAmount} onChange={e => setCashAmount(e.target.value)} autoFocus min="0" />
              </div>
              <div className="pos-cash-form-group">
                <label>Reason</label>
                <input type="text" placeholder="e.g. Additional cash" value={cashReason} onChange={e => setCashReason(e.target.value)} />
              </div>
              <div className="pos-table-modal-actions">
                <button type="submit" className="btn-sm primary">Add Cash In</button>
                <button type="button" className="btn-sm" onClick={() => { setShowCashIn(false); setCashAmount(''); setCashReason('') }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCashOut && (
        <div className="pos-table-modal-overlay" onClick={() => setShowCashOut(false)}>
          <div className="pos-table-modal" onClick={e => e.stopPropagation()}>
            <h3>Cash Out</h3>
            <form onSubmit={handleCashOut}>
              <div className="pos-cash-form-group">
                <label>Amount</label>
                <input type="number" placeholder="0" value={cashAmount} onChange={e => setCashAmount(e.target.value)} autoFocus min="0" />
              </div>
              <div className="pos-cash-form-group">
                <label>Reason</label>
                <input type="text" placeholder="e.g. Petty cash" value={cashReason} onChange={e => setCashReason(e.target.value)} />
              </div>
              <div className="pos-table-modal-actions">
                <button type="submit" className="btn-sm primary">Add Cash Out</button>
                <button type="button" className="btn-sm" onClick={() => { setShowCashOut(false); setCashAmount(''); setCashReason('') }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}