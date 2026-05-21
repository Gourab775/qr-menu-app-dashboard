import React, { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate, formatTime } from '../utils/formatDateTime'
import './PastOrdersPage.css'

const STATUS_CONFIG = {
  accepted: { label: 'Accepted', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  confirmed: { label: 'Confirmed', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  completed: { label: 'Completed', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' }
}

function PastOrdersPage({ pastOrders, loading, onToast }) {
  const [timeFilter, setTimeFilter] = useState('today')
  const [actionLoading, setActionLoading] = useState(null)

  const filteredOrders = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

    return pastOrders.filter(o => {
      const date = new Date(o.created_at)
      if (timeFilter === 'today') return date >= todayStart
      if (timeFilter === 'week') return date >= weekAgo
      return true
    })
  }, [pastOrders, timeFilter])

  const handleAction = async (orderId, newStatus) => {
    if (actionLoading) return
    setActionLoading(orderId)
    try {
      const { error } = await supabase.from('live_orders').update({ status: newStatus }).eq('id', orderId)
      if (error) throw error
      if (onToast) onToast(`Order ${newStatus === 'completed' ? 'completed' : newStatus === 'confirmed' ? 'confirmed' : 'updated'}`, 'success')
    } catch (err) {
      console.error(`Error updating order ${orderId}:`, err)
      if (onToast) onToast('Failed to update order', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: '#666', bg: 'rgba(255,255,255,0.05)' }
    return (
      <span className="past-status-badge" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.color }}>
        {cfg.label}
      </span>
    )
  }

  const getNextActions = (order) => {
    if (order.status === 'accepted') {
      return (
        <button
          className="past-action-btn past-action-confirm"
          onClick={() => handleAction(order.id, 'confirmed')}
          disabled={actionLoading === order.id}
        >
          Confirm
        </button>
      )
    }
    if (order.status === 'confirmed') {
      return (
        <button
          className="past-action-btn past-action-complete"
          onClick={() => handleAction(order.id, 'completed')}
          disabled={actionLoading === order.id}
        >
          Complete
        </button>
      )
    }
    return null
  }

  const orderCounts = {
    total: pastOrders.length,
    today: filteredOrders.length
  }

  return (
    <div className="past-orders-page">
      <div className="past-orders-header">
        <div className="past-orders-title-row">
          <h2 className="past-orders-title">Past Orders</h2>
          <div className="past-orders-stats">
            <span className="past-stat-badge">{pastOrders.length} total</span>
            <span className="past-stat-badge past-stat-today">{orderCounts.today} shown</span>
          </div>
        </div>
      </div>

      <div className="past-filter-bar">
        <button
          className={`past-filter-btn ${timeFilter === 'today' ? 'active' : ''}`}
          onClick={() => setTimeFilter('today')}
        >
          Today
        </button>
        <button
          className={`past-filter-btn ${timeFilter === 'week' ? 'active' : ''}`}
          onClick={() => setTimeFilter('week')}
        >
          Last 7 Days
        </button>
        <button
          className={`past-filter-btn ${timeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setTimeFilter('all')}
        >
          All
        </button>
      </div>

      {loading && pastOrders.length === 0 ? (
        <div className="past-loading-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-line" style={{ width: '40%' }}></div>
              <div className="skeleton-line"></div>
              <div className="skeleton-line short"></div>
            </div>
          ))}
        </div>
      ) : pastOrders.length === 0 ? (
        <div className="past-empty-state">
          <div className="past-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
              <path d="M3 3h18v18H3V3z" />
              <path d="M8 3v18" />
              <path d="M16 3v18" />
              <path d="M3 8h18" />
              <path d="M3 16h18" />
            </svg>
          </div>
          <p className="past-empty-text">No past orders yet</p>
          <p className="past-empty-hint">Accepted and completed orders will appear here</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="past-empty-state">
          <div className="past-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4l3 3" />
            </svg>
          </div>
          <p className="past-empty-text">No orders in this period</p>
          <p className="past-empty-hint">Try a different time filter</p>
        </div>
      ) : (
        <div className="past-orders-grid">
          {filteredOrders.map(order => {
            const items = Array.isArray(order.items) ? order.items : []
            const tableNum = order.restaurant_tables?.table_number
            const orderCode = order.order_code || (order.id ? order.id.slice(0, 8).toUpperCase() : 'N/A')
            const totalPrice = order.total_price != null ? Number(order.total_price) : 0

            return (
              <div key={order.id} className={`past-order-card ${order.status}`}>
                <div className="past-card-top">
                  <div className="past-card-id-row">
                    <span className="past-order-code">#{orderCode}</span>
                    {tableNum && <span className="past-table-tag">Table {tableNum}</span>}
                  </div>
                  <div className="past-card-time">
                    <span className="past-date">{formatDate(order.created_at)}</span>
                    <span className="past-time">{formatTime(order.created_at)}</span>
                  </div>
                </div>

                <div className="past-card-body">
                  <div className="past-items-list">
                    {items.length > 0 ? items.map((item, i) => (
                      <div key={i} className="past-item-row">
                        <span className="past-item-name">{item.name || 'Item'}</span>
                        <span className="past-item-qty">x{item.quantity ?? 1}</span>
                        <span className="past-item-price">₹{((item.price ?? 0) * (item.quantity ?? 1)).toFixed(0)}</span>
                      </div>
                    )) : (
                      <div className="past-item-row">
                        <span className="past-item-name" style={{ color: '#555', fontStyle: 'italic' }}>No items</span>
                      </div>
                    )}
                  </div>

                  {order.note && (
                    <div className="past-note-row">
                      <span className="past-note-label">Note:</span>
                      <span className="past-note-text">{order.note}</span>
                    </div>
                  )}
                </div>

                <div className="past-card-bottom">
                  <div className="past-total-row">
                    <span className="past-total-label">Total</span>
                    <span className="past-total-amount">₹{totalPrice.toFixed(0)}</span>
                  </div>
                  <div className="past-card-footer-row">
                    {getStatusBadge(order.status)}
                    {getNextActions(order)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PastOrdersPage
