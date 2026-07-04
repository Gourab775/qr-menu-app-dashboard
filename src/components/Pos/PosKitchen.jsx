import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconPrinter, IconChefHat, IconClock } from '../Icons'
import { formatOrderDateTime } from '../../utils/formatDateTime'

const API_TIMEOUT = 30000
const REFRESH_INTERVAL = 15000

const KOT_STATUSES = [
  { id: 'kot_generated', label: 'New KOT', icon: '📄', color: 'var(--orange)' },
  { id: 'cooking', label: 'Cooking', icon: '🍳', color: 'var(--blue)' },
  { id: 'ready', label: 'Ready', icon: '✅', color: 'var(--green)' },
  { id: 'served', label: 'Served', icon: '🍽️', color: 'var(--text-muted)' },
]

export default function PosKitchen({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [updatingId, setUpdatingId] = useState(null)

  const mountedRef = useRef(false)
  const intervalRef = useRef(null)

  const loadOrders = useCallback(async () => {
    try {
      const { data, error: queryError } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('id, order_code, total_price, items, status, created_at, note')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .in('status', ['kot_generated', 'cooking', 'ready', 'served'])
          .order('created_at', { ascending: false }),
        API_TIMEOUT
      )
      if (!mountedRef.current) return
      if (queryError) throw queryError
      setOrders(data || [])
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Failed to load KOTs')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    mountedRef.current = true
    loadOrders()
    intervalRef.current = setInterval(loadOrders, REFRESH_INTERVAL)
    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadOrders])

  const updateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId)
    try {
      const { error } = await supabase
        .from('live_orders')
        .update({ status: newStatus })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
      if (error) throw error
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    } catch (err) {
      console.error('Failed to update KOT status:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const getNextStatus = (currentStatus) => {
    const flow = ['kot_generated', 'cooking', 'ready', 'served']
    const idx = flow.indexOf(currentStatus)
    if (idx < flow.length - 1) return flow[idx + 1]
    return null
  }

  const getKOTItems = (items) => {
    if (!Array.isArray(items)) return []
    return items.filter(i => !i._pos_meta)
  }

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return orders
    return orders.filter(o => o.status === activeFilter)
  }, [orders, activeFilter])

  const orderCounts = useMemo(() => {
    const counts = { all: orders.length }
    KOT_STATUSES.forEach(s => {
      counts[s.id] = orders.filter(o => o.status === s.id).length
    })
    return counts
  }, [orders])

  const formatKOTTime = (createdAt) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
    if (diff < 1) return 'Just now'
    if (diff < 60) return `${diff}m ago`
    return formatOrderDateTime(createdAt)
  }

  if (loading) {
    return (
      <div className="pos-kitchen-page">
        <div className="pos-loading">
          <div className="loading-spinner"></div>
          <p>Loading kitchen orders...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pos-kitchen-page">
        <div className="pos-empty">
          <p>Failed to load KOTs</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</p>
          <button className="pos-cart-action-btn pay" style={{ marginTop: 12, padding: '8px 20px' }} onClick={loadOrders}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-kitchen-page">
      <div className="pos-kitchen-header">
        <h2>Kitchen Display</h2>
        <div className="pos-kitchen-actions">
          <span className="pos-kitchen-auto">Auto-refreshes every 15s</span>
          <button className="pos-kitchen-refresh" onClick={loadOrders}>Refresh</button>
        </div>
      </div>

      <div className="pos-kitchen-filter-bar">
        <button
          className={`pos-kitchen-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >All ({orderCounts.all})</button>
        {KOT_STATUSES.map(s => (
          <button
            key={s.id}
            className={`pos-kitchen-filter-btn ${activeFilter === s.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(s.id)}
            style={activeFilter === s.id ? { borderColor: s.color, background: `${s.color}15`, color: s.color } : {}}
          >
            {s.icon} {s.label} ({orderCounts[s.id] || 0})
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="pos-empty">
          <IconChefHat size={48} />
          <span>No active KOTs</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>New orders from billing will appear here</span>
        </div>
      ) : (
        <div className="pos-kitchen-grid">
          {filteredOrders.map(order => {
            const kotItems = getKOTItems(order.items)
            const currentStatusObj = KOT_STATUSES.find(s => s.id === order.status)
            const nextStatus = getNextStatus(order.status)
            const isUpdating = updatingId === order.id
            const meta = Array.isArray(order.items) ? order.items.find(i => i._pos_meta) : null
            const tableInfo = order.note?.match(/Table (\S+)/)?.[1] || ''

            return (
              <div key={order.id} className={`pos-kot-card status-${order.status}`}>
                <div className="pos-kot-card-header">
                  <div className="pos-kot-card-header-left">
                    <span className="pos-kot-order-code">#{order.order_code || order.id.slice(0, 6).toUpperCase()}</span>
                    {tableInfo && <span className="pos-kot-table-badge">T{tableInfo}</span>}
                  </div>
                  <div className="pos-kot-card-header-right">
                    <span className="pos-kot-time">
                      <IconClock size={12} /> {formatKOTTime(order.created_at)}
                    </span>
                    <span className={`pos-kot-badge ${order.status}`}>
                      {currentStatusObj?.icon} {currentStatusObj?.label || order.status}
                    </span>
                  </div>
                </div>

                <div className="pos-kot-items">
                  {kotItems.map((item, idx) => (
                    <div key={idx} className="pos-kot-item-row">
                      <span className="pos-kot-item-qty">{item.quantity}x</span>
                      <span className="pos-kot-item-name">{item.name}</span>
                      {item.notes && <span className="pos-kot-item-notes">{item.notes}</span>}
                    </div>
                  ))}
                </div>

                <div className="pos-kot-card-footer">
                  {nextStatus ? (
                    <button
                      className="pos-kot-action-btn"
                      onClick={() => updateStatus(order.id, nextStatus)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? 'Updating...' : `${KOT_STATUSES.find(s => s.id === nextStatus)?.icon || ''} Mark as ${KOT_STATUSES.find(s => s.id === nextStatus)?.label || nextStatus}`}
                    </button>
                  ) : (
                    <span className="pos-kot-served-label">✓ Served</span>
                  )}
                  <button className="pos-kot-print-btn" title="Reprint KOT" onClick={() => alert('KOT print: ' + (order.order_code || order.id.slice(0, 6).toUpperCase()))}>
                    <IconPrinter size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}