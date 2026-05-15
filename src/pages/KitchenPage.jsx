import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../lib/apiUtils'

const API_TIMEOUT = 15000

export default function KitchenPage({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mountedRef = useRef(false)
  const abortControllerRef = useRef(null)

  const fetchKitchenOrders = useCallback(async (signal = null) => {
    if (!restaurantId) return
    if (!signal && mountedRef.current) setLoading(true)
    
    try {
      let kitchenPromise = supabase
        .from('kitchen_board')
        .select('*, restaurant_tables(table_number), live_orders(order_code, accepted_at)')
        .neq('status', 'completed')
        .order('created_at', { ascending: true })

      let { data, error } = await fetchWithTimeout(kitchenPromise, API_TIMEOUT)

      if (signal?.aborted) return

      if (error) {
        console.warn('Initial fetch error, trying without join:', error.message)
        const fallbackPromise = supabase
          .from('kitchen_board')
          .select('*, live_orders(order_code, accepted_at)')
          .neq('status', 'completed')
          .order('created_at', { ascending: true })
        
        const fallbackRes = await fetchWithTimeout(fallbackPromise, API_TIMEOUT)
        data = fallbackRes.data
        error = fallbackRes.error
      }

      if (signal?.aborted) return

      if (error) throw error

      const unresolvedIds = [...new Set(
        (data || [])
          .filter(o => o.table_id && !o.restaurant_tables?.table_number)
          .map(o => o.table_id)
      )]
      
      let tableMap = {}
      if (unresolvedIds.length > 0) {
        const tablesPromise = supabase
          .from('restaurant_tables')
          .select('id, table_number')
          .in('id', unresolvedIds)
        
        const { data: tableRows } = await fetchWithTimeout(tablesPromise, API_TIMEOUT)
        if (!signal?.aborted) {
          (tableRows || []).forEach(t => { tableMap[t.id] = t.table_number })
        }
      }

      if (signal?.aborted) return

      const resolvedData = (data || []).map(order => ({
        ...order,
        restaurant_tables: order.restaurant_tables ?? (order.table_id && tableMap[order.table_id] ? { table_number: tableMap[order.table_id] } : null)
      }))

      if (!signal?.aborted) {
        setOrders(resolvedData)
        setError(null)
      }
    } catch (err) {
      console.error('Error fetching kitchen orders:', err)
      if (!signal?.aborted) {
        setError(err.name === 'AbortError' ? 'Request cancelled' : err.message)
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId) return
    mountedRef.current = true

    const controller = new AbortController()
    abortControllerRef.current = controller

    fetchKitchenOrders(controller.signal)

    const channel = supabase
      .channel('kitchen-board-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kitchen_board' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            fetchKitchenOrders(controller.signal)
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.status === 'completed') {
              setOrders(prev => prev.filter(o => o.id !== payload.new.id))
            } else {
              setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o))
            }
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      controller.abort()
      abortControllerRef.current = null
      supabase.removeChannel(channel)
    }
  }, [fetchKitchenOrders])

  const updateStatus = async (orderId, status) => {
    try {
      const { error } = await supabase
        .from('kitchen_board')
        .update({ status })
        .eq('id', orderId)
      
      if (error) throw error
      
      // Local update for immediate UI response
      if (status === 'completed') {
        setOrders(prev => prev.filter(o => o.id !== orderId))
      } else {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
      }
    } catch (err) {
      console.error('Error updating kitchen status:', err)
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Syncing kitchen board...</p>
      </div>
    )
  }

  return (
    <div className="kitchen-section">
      <div className="kitchen-header">
        <div className="kitchen-stats">
          <span className="stat-label">🔥 Kitchen Queue</span>
          <span className="stat-value">{orders.length}</span>
        </div>
        <button onClick={() => fetchKitchenOrders()} className="refresh-btn-glass">
          <span className="sync-icon">🔄</span> Sync
        </button>
      </div>

      {error ? (
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Failed to load kitchen orders</h3>
          <p>{error}</p>
          <button onClick={() => fetchKitchenOrders()} className="refresh-btn-glass">
            Retry
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👨‍🍳</div>
          <h3>All caught up!</h3>
          <p>No orders currently in the kitchen.</p>
        </div>
      ) : (
        <div className="kitchen-grid">
          {orders.map(order => (
            <KitchenOrderCard 
              key={order.id} 
              order={order} 
              onUpdateStatus={updateStatus} 
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KitchenOrderCard({ order, onUpdateStatus }) {
  const tableNum = order.restaurant_tables?.table_number || 'N/A'
  
  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending': return { color: 'var(--blue)', label: 'Pending' }
      case 'preparing': return { color: 'var(--orange)', label: 'Preparing' }
      case 'ready': return { color: 'var(--green)', label: 'Ready' }
      default: return { color: 'var(--text-muted)', label: status }
    }
  }

  const statusInfo = getStatusInfo(order.status)

  return (
    <div className={`kitchen-card ${order.status}`}>
      <div className="kitchen-card-header-top">
        <span className="k-order-badge">#{order.live_orders?.order_code || order.order_id?.slice(0, 8).toUpperCase() || 'N/A'}</span>
      </div>
      <div className="kitchen-card-header">
        <div className="kitchen-table-info">
          <span className="info-label">TABLE</span>
          <span className="table-number">{tableNum}</span>
        </div>
        <div className="kitchen-time-info">
          <span className="info-label">SINCE ACCEPTED</span>
          <div className="kitchen-timer-badge">
            <span className="clock-icon">🕒</span>
            <KitchenTimer confirmedAt={order.live_orders?.accepted_at || order.created_at} />
          </div>
        </div>
      </div>

      <div className="kitchen-items-list">
        <div className="items-header">ORDER ITEMS</div>
        {order.items?.map((item, i) => (
          <div key={i} className="kitchen-item-row">
            <span className="item-name">{item.name}</span>
            <span className="item-qty">x{item.quantity}</span>
          </div>
        ))}
      </div>

      <div className="kitchen-status-indicator">
        <span className="status-dot" style={{ backgroundColor: statusInfo.color }}></span>
        <span className="status-text">{statusInfo.label.toUpperCase()}</span>
      </div>

      <div className="kitchen-actions">
        {order.status === 'pending' && (
          <button 
            className="k-action-btn preparing"
            onClick={() => onUpdateStatus(order.id, 'preparing')}
          >
            Start Preparing
          </button>
        )}
        {order.status === 'preparing' && (
          <button 
            className="k-action-btn ready"
            onClick={() => onUpdateStatus(order.id, 'ready')}
          >
            Mark Ready
          </button>
        )}
        {order.status === 'ready' && (
          <button 
            className="k-action-btn completed"
            onClick={() => onUpdateStatus(order.id, 'completed')}
          >
            Complete Order
          </button>
        )}
      </div>
    </div>
  )
}

function KitchenTimer({ confirmedAt }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const start = new Date(confirmedAt)
      const diff = Math.floor((now - start) / 1000)

      if (diff < 0) { setElapsed('00:00'); return }

      const hours = Math.floor(diff / 3600)
      const mins = Math.floor((diff % 3600) / 60)
      const secs = diff % 60

      if (hours > 0) {
        setElapsed(
          `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        )
      } else {
        setElapsed(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [confirmedAt])

  return <span className="timer-text">{elapsed}</span>
}
