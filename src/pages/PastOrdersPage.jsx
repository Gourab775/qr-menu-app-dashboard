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
  const [searchQuery, setSearchQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState('today')
  const [expandedId, setExpandedId] = useState(null)

  const filteredOrders = useMemo(() => {
    if (hideFilters) return pastOrders

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

    return pastOrders.filter(o => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const code = (o.order_code || '').toLowerCase()
        const table = (o.restaurant_tables?.table_number?.toString() || '')
        if (!code.includes(q) && !table.includes(q)) return false
      }
      const date = new Date(o.created_at)
      if (timeFilter === 'today') return date >= todayStart
      if (timeFilter === 'week') return date >= weekAgo
      return true
    })
  }, [pastOrders, timeFilter, searchQuery, hideFilters])

  const displayOrders = hideFilters ? pastOrders : filteredOrders

  return (
    <div className="po-page">
      <div className="po-header">
        <div className="po-title-row">
          <h2 className="po-title">Past Orders</h2>
          <span className="po-count">{pastOrders.length} orders</span>
        </div>
        {!hideFilters && (
          <div className="po-filters">
            <input
              type="text"
              className="po-search"
              placeholder="Search by order ID or table..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div className="po-time-filters">
              {['today', 'week', 'all'].map(f => (
                <button
                  key={f}
                  className={`po-time-btn ${timeFilter === f ? 'active' : ''}`}
                  onClick={() => setTimeFilter(f)}
                >
                  {f === 'today' ? 'Today' : f === 'week' ? '7 Days' : 'All'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && pastOrders.length === 0 ? (
        <div className="po-loading">
          {[1, 2, 3].map(i => (
            <div key={i} className="po-skeleton" />
          ))}
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="po-empty">
          <svg className="po-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="M15 3v18" />
            <path d="M3 9h18" />
            <path d="M3 15h18" />
          </svg>
          <p className="po-empty-text">No past orders found</p>
          {(searchQuery || timeFilter !== 'all') && (
            <p className="po-empty-hint">Try adjusting your search or filters</p>
          )}
        </div>
      ) : (
        <div className="po-list">
          {displayOrders.map(order => {
            const items = Array.isArray(order.items) ? order.items : []
            const tableNum = order.restaurant_tables?.table_number
            const orderCode = order.order_code || (order.id ? order.id.slice(0, 8).toUpperCase() : 'N/A')
            const totalPrice = order.total_price != null ? Number(order.total_price) : 0
            const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#666', bg: 'rgba(255,255,255,0.05)' }
            const isExpanded = expandedId === order.id

            return (
              <div key={order.id} className={`po-card ${isExpanded ? 'expanded' : ''}`}>
                <div className="po-card-main">
                  <div className="po-card-left">
                    <span className="po-order-code">#{orderCode}</span>
                    {tableNum && <span className="po-table-tag">Table {tableNum}</span>}
                  </div>
                  <div className="po-card-center">
                    <span className="po-datetime">
                      {formatDate(order.created_at)}, {formatTime(order.created_at)}
                    </span>
                  </div>
                  <div className="po-card-right">
                    <span className="po-items-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                    <span className="po-total">₹{totalPrice.toFixed(0)}</span>
                    <span className="po-status" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    <button className="po-details-btn" onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                      {isExpanded ? 'Hide' : 'View Details'}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="po-card-details">
                    {items.length > 0 ? (
                      <div className="po-details-items">
                        {items.map((item, i) => (
                          <div key={i} className="po-detail-row">
                            <span className="po-detail-name">{item.name || 'Item'}</span>
                            <span className="po-detail-qty">x{item.quantity ?? 1}</span>
                            <span className="po-detail-price">₹{((item.price ?? 0) * (item.quantity ?? 1)).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="po-detail-row">
                        <span className="po-detail-name" style={{ color: '#71717a', fontStyle: 'italic' }}>No items</span>
                      </div>
                    )}
                    {order.note && (
                      <div className="po-detail-note">
                        <span className="po-note-label">Note: </span>
                        <span className="po-note-text">{order.note}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PastOrdersPage
