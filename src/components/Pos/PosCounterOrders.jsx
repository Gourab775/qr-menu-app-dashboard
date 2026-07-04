import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconClipboard, IconSearch, IconPrinter } from '../../components/Icons'
import { formatOrderDateTime } from '../../utils/formatDateTime'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (Math.round(v) || 0).toLocaleString('en-IN')
}

const STATUS_LABELS = {
  kot_generated: 'KOT',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served',
  completed: 'Completed',
  pending: 'Pending',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
}

export default function PosCounterOrders({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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
          .limit(200),
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

  const getMeta = (items) => {
    if (!Array.isArray(items)) return null
    return items.find(i => i._pos_meta) || null
  }

  const filteredOrders = useMemo(() => {
    let result = orders
    if (statusFilter !== 'all') {
      result = result.filter(o => o.status === statusFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o => {
        const code = (o.order_code || '').toLowerCase()
        const note = (o.note || '').toLowerCase()
        const meta = getMeta(o.items)
        const customerName = (meta?.customer_name || '').toLowerCase()
        return code.includes(q) || note.includes(q) || customerName.includes(q)
      })
    }
    return result
  }, [orders, statusFilter, searchQuery])

  const ordersTotal = useMemo(() =>
    orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0),
    [orders]
  )
  const completedCount = useMemo(() =>
    orders.filter(o => o.status === 'completed').length,
    [orders]
  )

  const reprintBill = (order) => {
    const meta = getMeta(order.items)
    const items = Array.isArray(order.items) ? order.items.filter(i => !i._pos_meta) : []
    const billLines = [
      '═══════════════════════════════',
      `  ${order.order_code || 'BILL'}`,
      '═══════════════════════════════',
      ...items.map(i =>
        `  ${i.name} x${i.quantity}  ${formatCurrency(i.total)}`
      ),
      '───────────────────────────────',
      `  Total: ${formatCurrency(order.total_price)}`,
      meta?.payment_method ? `  Payment: ${meta.payment_method.toUpperCase()}` : '',
      '═══════════════════════════════',
      `  ${formatOrderDateTime(order.created_at)}`,
      '═══════════════════════════════',
    ].filter(Boolean).join('\n')
    alert(billLines)
  }

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

      <div className="pos-orders-filter-row">
        <div className="pos-order-status-filters">
          <button className={`pos-order-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All</button>
          <button className={`pos-order-filter-btn ${statusFilter === 'kot_generated' ? 'active' : ''}`} onClick={() => setStatusFilter('kot_generated')}>KOT</button>
          <button className={`pos-order-filter-btn ${statusFilter === 'cooking' ? 'active' : ''}`} onClick={() => setStatusFilter('cooking')}>Cooking</button>
          <button className={`pos-order-filter-btn ${statusFilter === 'ready' ? 'active' : ''}`} onClick={() => setStatusFilter('ready')}>Ready</button>
          <button className={`pos-order-filter-btn ${statusFilter === 'served' ? 'active' : ''}`} onClick={() => setStatusFilter('served')}>Served</button>
          <button className={`pos-order-filter-btn ${statusFilter === 'completed' ? 'active' : ''}`} onClick={() => setStatusFilter('completed')}>Completed</button>
        </div>
        <input
          type="text"
          className="pos-search-input"
          placeholder="Search orders..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: 180, marginBottom: 0 }}
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="pos-empty">
          <IconClipboard size={40} />
          <span>No orders found</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bills created from the POS will appear here</span>
        </div>
      ) : (
        <div className="pos-orders-list">
          {filteredOrders.map(order => {
            const meta = getMeta(order.items)
            const itemCount = getItemCount(order.items)
            const statusLabel = STATUS_LABELS[order.status] || order.status
            const tableMatch = order.note?.match(/Table\s*(T?\d+)/i)
            const tableLabel = tableMatch ? tableMatch[1] : ''
            return (
              <div key={order.id} className="pos-order-card">
                <div className="pos-order-card-left">
                  <span className="pos-order-code">
                    #{order.order_code || order.id.slice(0, 6).toUpperCase()}
                    {tableLabel && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>T{tableLabel}</span>}
                  </span>
                  <div className="pos-order-meta">
                    <span>{formatOrderDateTime(order.created_at)}</span>
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  </div>
                  {meta?.customer_name && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {meta.customer_name}
                      {meta.token_number && ` · #${meta.token_number}`}
                    </span>
                  )}
                  {!meta && order.note && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{order.note}</span>
                  )}
                </div>
                <span className={`pos-order-status ${order.status}`}>{statusLabel}</span>
                <span className="pos-order-total">{formatCurrency(order.total_price)}</span>
                <button
                  className="pos-order-reprint-btn"
                  title="Reprint Bill"
                  onClick={() => reprintBill(order)}
                >
                  <IconPrinter size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}