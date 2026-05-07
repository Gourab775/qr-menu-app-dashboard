import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export default function KitchenPage({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchKitchenOrders = useCallback(async () => {
    if (!restaurantId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('kitchen_board')
        .select('*, restaurant_tables(table_number)')
        .eq('restaurant_id', restaurantId)
        .neq('status', 'completed')
        .order('created_at', { ascending: true })

      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      console.error('Error fetching kitchen orders:', err)
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    fetchKitchenOrders()

    const channel = supabase
      .channel('kitchen-board')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kitchen_board', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch the new order with table info
            const fetchNew = async () => {
              const { data } = await supabase
                .from('kitchen_board')
                .select('*, restaurant_tables(table_number)')
                .eq('id', payload.new.id)
                .single()
              if (data) {
                setOrders(prev => [...prev, data])
              }
            }
            fetchNew()
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
      
      // Local update for immediate feedback
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
        <p>Loading kitchen board...</p>
      </div>
    )
  }

  return (
    <div className="kitchen-section">
      <div className="kitchen-header">
        <div className="kitchen-stats">
          <span className="stat-label">Active Orders</span>
          <span className="stat-value">{orders.length}</span>
        </div>
        <button onClick={fetchKitchenOrders} className="refresh-btn-glass">
          🔄 Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🍳</div>
          <p>No active kitchen orders</p>
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
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'var(--text-muted)'
      case 'preparing': return 'var(--orange)'
      case 'ready': return 'var(--green)'
      default: return 'var(--text-muted)'
    }
  }

  return (
    <div className={`kitchen-card ${order.status}`}>
      <div className="kitchen-card-header">
        <div className="kitchen-table-info">
          <span className="info-label">Table</span>
          <span className="table-number">#{tableNum}</span>
        </div>
        <div className="kitchen-time-info">
          <span className="info-label">Accepted</span>
          <span className="kitchen-timer">
            <KitchenTimer startTime={order.created_at} />
          </span>
        </div>
      </div>

      <div className="kitchen-items-list">
        <div className="items-header">Items</div>
        {order.items?.map((item, i) => (
          <div key={i} className="kitchen-item-row">
            <span className="item-name">{item.name}</span>
            <span className="item-qty">x{item.quantity}</span>
          </div>
        ))}
      </div>

      <div className="kitchen-status-indicator">
        <span className="status-dot" style={{ backgroundColor: getStatusColor(order.status) }}></span>
        <span className="status-text">{order.status.toUpperCase()}</span>
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
            Done / Served
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
      const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
      if (diff < 60) setElapsed(`${diff}s`)
      else if (diff < 3600) setElapsed(`${Math.floor(diff / 60)}m ${diff % 60}s`)
      else setElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return <span>{elapsed}</span>
}
