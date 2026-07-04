import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconClipboard } from '../../components/Icons'
import { formatOrderDateTime } from '../../utils/formatDateTime'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (Math.round(v) || 0).toLocaleString('en-IN')
}

export default function PosCounterOrders({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    loadOrders()
    return () => { mountedRef.current = false }
  }, [restaurantId])

  const loadOrders = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('id, order_code, total_price, items, status, created_at, note')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .order('created_at', { ascending: false })
          .limit(100),
        API_TIMEOUT
      )
      if (!mountedRef.current) return
      if (queryError) throw queryError
      setOrders(data || [])
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Failed to load orders')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const getItemCount = (items) => {
    if (!Array.isArray(items)) return 0
    return items.reduce((s, i) => {
      if (i._pos_meta) return s
      return s + (i.quantity || 1)
    }, 0)
  }

  const ordersTotal = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
  const completedCount = orders.filter(o => o.status === 'completed').length

  if (loading) {
    return (
      <div className="pos-orders-page">
        <div className="pos-loading">
          <div className="loading-spinner"></div>
          <p>Loading orders...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pos-orders-page">
        <div className="pos-empty">
          <p>Failed to load orders</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</p>
          <button className="pos-cart-action-btn pay" style={{ marginTop: 12, padding: '8px 20px' }} onClick={loadOrders}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-orders-page">
      <div className="pos-orders-header">
        <h2>Counter Orders</h2>
        <div className="pos-orders-stats">
          <span>Total: <span className="num">{formatCurrency(ordersTotal)}</span></span>
          <span>Orders: <span className="num">{orders.length}</span></span>
          <span>Completed: <span className="num">{completedCount}</span></span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="pos-empty">
          <IconClipboard size={40} />
          <span>No counter orders yet</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bills created from the POS will appear here</span>
        </div>
      ) : (
        <div className="pos-orders-list">
          {orders.map(order => {
            const meta = Array.isArray(order.items) ? order.items.find(i => i._pos_meta) : null
            const itemCount = getItemCount(order.items)
            return (
              <div key={order.id} className="pos-order-card">
                <div className="pos-order-card-left">
                  <span className="pos-order-code">#{order.order_code || order.id.slice(0, 6).toUpperCase()}</span>
                  <div className="pos-order-meta">
                    <span>{formatOrderDateTime(order.created_at)}</span>
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  </div>
                  {meta?.payment_method && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {meta.payment_method.toUpperCase()}
                      {meta.customer_name && ` · ${meta.customer_name}`}
                    </span>
                  )}
                </div>
                <span className="pos-order-status completed">Completed</span>
                <span className="pos-order-total">{formatCurrency(order.total_price)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
