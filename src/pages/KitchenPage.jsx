import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function KitchenPage({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const isInitialFetch = useRef(true)

  const fetchKitchenOrders = useCallback(async () => {
    if (!restaurantId) return
    if (isInitialFetch.current) setLoading(true)
    
    try {
      // First attempt with restaurant_id filter and join
      let { data, error } = await supabase
        .from('kitchen_board')
        .select('*, restaurant_tables(table_number)')
        .eq('restaurant_id', restaurantId)
        .neq('status', 'completed')
        .order('created_at', { ascending: true })

      // Fallback: if restaurant_id filter failed, it might not exist
      if (error && error.message.includes('column "restaurant_id" does not exist')) {
        const result = await supabase
          .from('kitchen_board')
          .select('*, restaurant_tables(table_number)')
          .neq('status', 'completed')
          .order('created_at', { ascending: true })
        data = result.data
        error = result.error
      }

      if (error) throw error

      // --- Fallback table resolution (same as App.jsx) ---
      const unresolvedIds = [...new Set(
        (data || [])
          .filter(o => o.table_id && !o.restaurant_tables?.table_number)
          .map(o => o.table_id)
      )]
      
      let tableMap = {}
      if (unresolvedIds.length > 0) {
        const { data: tableRows } = await supabase
          .from('restaurant_tables')
          .select('id, table_number')
          .in('id', unresolvedIds)
        ;(tableRows || []).forEach(t => { tableMap[t.id] = t.table_number })
      }

      const resolvedData = (data || []).map(order => ({
        ...order,
        restaurant_tables: order.restaurant_tables ?? (order.table_id && tableMap[order.table_id] ? { table_number: tableMap[order.table_id] } : null)
      }))

      setOrders(resolvedData)
    } catch (err) {
      console.error('Error fetching kitchen orders:', err)
    } finally {
      setLoading(false)
      isInitialFetch.current = false
    }
  }, [restaurantId])

  useEffect(() => {
    fetchKitchenOrders()

    const channel = supabase
      .channel('kitchen-board-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kitchen_board' },
        (payload) => {
          // If we have restaurantId and the payload has it, filter here
          if (restaurantId && payload.new?.restaurant_id && payload.new.restaurant_id !== restaurantId) {
            return
          }

          if (payload.eventType === 'INSERT') {
            fetchKitchenOrders() // Re-fetch to get table info correctly
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
      supabase.removeChannel(channel)
    }
  }, [restaurantId, fetchKitchenOrders])

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
        <button onClick={fetchKitchenOrders} className="refresh-btn-glass">
          <span className="sync-icon">🔄</span> Sync
        </button>
      </div>

      {orders.length === 0 ? (
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
      <div className="kitchen-card-header">
        <div className="kitchen-table-info">
          <span className="info-label">TABLE</span>
          <span className="table-number">{tableNum}</span>
        </div>
        <div className="kitchen-time-info">
          <span className="info-label">SINCE ACCEPTED</span>
          <span className="kitchen-timer">
            <KitchenTimer startTime={order.created_at} />
          </span>
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

function KitchenTimer({ startTime }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const start = new Date(startTime)
      const diff = Math.floor((now - start) / 1000)
      
      if (diff < 60) setElapsed(`${diff}s`)
      else if (diff < 3600) {
        const mins = Math.floor(diff / 60)
        const secs = diff % 60
        setElapsed(`${mins}m ${secs}s`)
      } else {
        const hrs = Math.floor(diff / 3600)
        const mins = Math.floor((diff % 3600) / 60)
        setElapsed(`${hrs}h ${mins}m`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return <span>{elapsed}</span>
}
