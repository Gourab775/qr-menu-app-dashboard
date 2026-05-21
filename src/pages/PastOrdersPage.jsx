import React, { useState, useMemo } from 'react'
import { formatDate, formatTime } from '../utils/formatDateTime'
import './PastOrdersPage.css'

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  accepted:    { label: 'Accepted',    color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  confirmed:   { label: 'Confirmed',   color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  completed:   { label: 'Completed',   color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },
  cancelled:   { label: 'Cancelled',   color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
  declined:    { label: 'Declined',    color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
}

function PastOrdersPage({ pastOrders, loading, onToast, hideFilters }) {
  const [timeFilter, setTimeFilter] = useState('today')

  const filteredOrders = useMemo(() => {
    if (hideFilters) return pastOrders

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

    return pastOrders.filter(o => {
      const date = new Date(o.created_at)
      if (timeFilter === 'today') return date >= todayStart
      if (timeFilter === 'week') return date >= weekAgo
      return true
    })
  }, [pastOrders, timeFilter, hideFilters])

  const getStatusBadge = (status) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: '#666', bg: 'rgba(255,255,255,0.05)' }
    return (
      <span className="past-status-badge" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.color }}>
        {cfg.label}
      </span>
    )
  }

  const displayOrders = hideFilters ? pastOrders : filteredOrders

  return (
    <div className="past-orders-page">
      {hideFilters ? (
        <div className="past-orders-header-simple">
          <span className="past-header-label">Past Orders</span>
          <span className="past-header-total">Total: {pastOrders.length}</span>
        </div>
      ) : (
        <div className="past-orders-header">
          <div className="past-orders-title-row">
            <h2 className="past-orders-title">Past Orders</h2>
            <div className="past-orders-stats">
              <span className="past-stat-badge">{pastOrders.length} total</span>
              <span className="past-stat-badge past-stat-today">{filteredOrders.length} shown</span>
            </div>
          </div>
        </div>
      )}

      {!hideFilters && (
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
      )}

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
      ) : displayOrders.length === 0 ? (
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
          {displayOrders.map(order => {
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
