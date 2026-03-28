import { useState, useEffect } from 'react'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

export default function Analytics() {
  const [stats, setStats] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0
  })
  const [topItems, setTopItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()

      const { data: orders, error } = await supabase
        .from('live_orders')
        .select('*')
        .gte('created_at', todayISO)
        .order('created_at', { ascending: false })

      if (error) throw error

      const allOrders = orders || []
      const todayOrders = allOrders.length
      const todayRevenue = allOrders.reduce((sum, o) => sum + (o.total_price || 0), 0)

      const itemCount = {}
      allOrders.forEach(order => {
        (order.items || []).forEach(item => {
          const name = item.name || 'Unknown'
          itemCount[name] = (itemCount[name] || 0) + (item.quantity || 1)
        })
      })

      const top = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      setTopItems(top)
      setStats({
        todayOrders,
        todayRevenue,
        totalOrders: todayOrders,
        avgOrderValue: todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0
      })
    } catch (err) {
      console.error('Analytics error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="analytics-section">
      <div className="analytics-header">
        <h2 className="analytics-title">📊 Today's Overview</h2>
        <button onClick={loadAnalytics} className="refresh-btn-small">
          🔄
        </button>
      </div>

      <div className="analytics-grid">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <span className="stat-value">{loading ? '...' : stats.todayOrders}</span>
            <span className="stat-label">Orders Today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <span className="stat-value">
              {loading ? '...' : `₹${stats.todayRevenue.toLocaleString()}`}
            </span>
            <span className="stat-label">Revenue Today</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <span className="stat-value">
              {loading ? '...' : `₹${stats.avgOrderValue}`}
            </span>
            <span className="stat-label">Avg Order Value</span>
          </div>
        </div>
      </div>

      {topItems.length > 0 && (
        <div className="top-items">
          <h3 className="top-items-title">🏆 Top Selling Items</h3>
          <div className="top-items-list">
            {topItems.map((item, index) => (
              <div key={item.name} className="top-item">
                <span className="top-item-rank">{index + 1}</span>
                <span className="top-item-name">{item.name}</span>
                <span className="top-item-count">{item.count} sold</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
