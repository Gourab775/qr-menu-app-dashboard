import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconBarChart } from '../../components/Icons'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (Math.round(v) || 0).toLocaleString('en-IN')
}

export default function PosReports({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const mountedRef = useRef(false)
  const todayStr = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    mountedRef.current = true
    loadData()
    return () => { mountedRef.current = false }
  }, [restaurantId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const startOfDay = `${todayStr}T00:00:00.000Z`
      const endOfDay = `${todayStr}T23:59:59.999Z`

      const { data: todayData, error: todayErr } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('id, total_price, items, status, created_at')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .order('created_at', { ascending: false }),
        API_TIMEOUT
      )

      const { data: allData, error: allErr } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('id, total_price, items, status, created_at')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .order('created_at', { ascending: false }),
        API_TIMEOUT
      )

      if (!mountedRef.current) return
      if (todayErr) throw todayErr
      if (allErr) throw allErr

      setOrders(allData || [])
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Failed to load reports')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const { dailySales, dailyOrders, dailyItems, topItems, allTimeRevenue } = useMemo(() => {
    const completed = orders.filter(o => o.status === 'completed')
    const todayOrders = completed.filter(o => {
      const d = new Date(o.created_at).toISOString().slice(0, 10)
      return d === todayStr
    })

    const dailySalesTotal = todayOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    const dailyOrderCount = todayOrders.length

    const itemCounts = {}
    completed.forEach(order => {
      if (!Array.isArray(order.items)) return
      order.items.forEach(item => {
        if (item._pos_meta) return
        const name = item.name || 'Item'
        const qty = item.quantity || 1
        itemCounts[name] = (itemCounts[name] || 0) + qty
      })
    })

    const sortedItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))

    const dailyItemsSold = todayOrders.reduce((s, o) => {
      if (!Array.isArray(o.items)) return s
      return s + o.items.filter(i => !i._pos_meta).reduce((sum, i) => sum + (i.quantity || 1), 0)
    }, 0)

    const allRevenue = completed.reduce((s, o) => s + (Number(o.total_price) || 0), 0)

    return {
      dailySales: dailySalesTotal,
      dailyOrders: dailyOrderCount,
      dailyItems: dailyItemsSold,
      topItems: sortedItems,
      allTimeRevenue: allRevenue,
    }
  }, [orders, todayStr])

  if (loading) {
    return (
      <div className="pos-reports-page">
        <div className="pos-loading">
          <div className="loading-spinner"></div>
          <p>Loading reports...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pos-reports-page">
        <div className="pos-empty">
          <p>Failed to load reports</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</p>
          <button className="pos-cart-action-btn pay" style={{ marginTop: 12, padding: '8px 20px' }} onClick={loadData}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-reports-page">
      <div className="pos-reports-header">
        <h2>Today's Reports</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      <div className="pos-reports-grid">
        <div className="pos-report-card sales">
          <div className="label">Daily Sales</div>
          <div className="value">{formatCurrency(dailySales)}</div>
          <div className="sub">Today's total revenue</div>
        </div>
        <div className="pos-report-card orders">
          <div className="label">Orders</div>
          <div className="value">{dailyOrders}</div>
          <div className="sub">Bills completed today</div>
        </div>
        <div className="pos-report-card items">
          <div className="label">Items Sold</div>
          <div className="value">{dailyItems}</div>
          <div className="sub">Total items today</div>
        </div>
      </div>

      <div className="pos-report-section">
        <h3>Best Selling Items (All Time)</h3>
        {topItems.length === 0 ? (
          <div className="pos-empty" style={{ padding: '20px' }}>
            <span>No sales data yet</span>
          </div>
        ) : (
          <div className="pos-top-items-list">
            {topItems.map((item, i) => (
              <div key={item.name} className="pos-top-item-row">
                <span className={`pos-top-item-rank r${i + 1}`}>#{i + 1}</span>
                <div className="pos-top-item-info">
                  <div className="name">{item.name}</div>
                  <div className="count">{item.count} sold</div>
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
