import { useState, useEffect, useCallback } from 'react'
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

const CHART_COLORS = {
  revenue: '#22c55e',
  orders: '#3b82f6',
  counter: '#f59e0b',
  online: '#8b5cf6',
  muted: '#6b7280'
}

const SkeletonCard = () => (
  <div className="premium-kpi-card">
    <div className="skeleton-line" style={{ width: '50%', height: 14, marginBottom: 12 }} />
    <div className="skeleton-line" style={{ width: '70%', height: 32, marginBottom: 8 }} />
    <div className="skeleton-line short" style={{ width: '40%', height: 12 }} />
  </div>
)

const SkeletonChart = ({ height = 280 }) => (
  <div className="premium-chart-section">
    <div className="skeleton-line" style={{ width: '25%', height: 20, marginBottom: 20 }} />
    <div className="skeleton-line" style={{ width: '100%', height: height }} />
  </div>
)

const SkeletonActivity = () => (
  <div className="premium-activity-item">
    <div className="skeleton-line" style={{ width: 40, height: 40, borderRadius: '50%' }} />
    <div style={{ flex: 1 }}>
      <div className="skeleton-line" style={{ width: '60%', height: 14, marginBottom: 8 }} />
      <div className="skeleton-line" style={{ width: '40%', height: 12 }} />
    </div>
  </div>
)

export default function OverviewPage({ restaurantId }) {
  const [timeRange, setTimeRange] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const getDateRange = useCallback((range) => {
    const now = new Date()
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    let endDate = new Date(now)
    endDate.setHours(23, 59, 59, 999)

    switch (range) {
      case 'today': break
      case '7days': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
      case '30days': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
      case 'all': startDate = new Date(2020, 0, 1); break
      default: startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }
    return { start: startDate.toISOString(), end: endDate.toISOString() }
  }, [])

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange(timeRange)

      const { data: orders, error: queryError } = await supabase
        .from('live_orders')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })

      if (queryError) throw new Error(queryError.message)

      const allOrders = Array.isArray(orders) ? orders : []
      
      if (allOrders.length === 0) {
        setData(getEmptyData())
        return
      }
      
      const pendingOrders = allOrders.filter(o => o.status !== 'accepted' && o.status !== 'rejected')
      const completedOrders = allOrders.filter(o => o.status === 'accepted')
      
      const itemCount = {}
      const dayRevenue = {}
      const dayOrders = {}
      const paymentModes = { counter: 0, online: 0 }
      const recentActivity = []
      
      allOrders.forEach(order => {
        if (!order?.created_at) return
        
        const orderDate = new Date(order.created_at)
        const dayKey = orderDate.toISOString().split('T')[0]
        
        dayRevenue[dayKey] = (dayRevenue[dayKey] || 0) + (Number(order.total_price) || 0)
        dayOrders[dayKey] = (dayOrders[dayKey] || 0) + 1
        
        const pm = (order.payment_mode || 'counter').toLowerCase()
        paymentModes[pm === 'online' ? 'online' : 'counter']++

        const items = Array.isArray(order.items) ? order.items : []
        items.forEach(item => {
          if (!item) return
          const name = item.name || 'Unknown'
          itemCount[name] = (itemCount[name] || 0) + (Number(item.quantity) || 1)
        })

        if (recentActivity.length < 8) {
          recentActivity.push({
            id: order.id,
            code: order.order_code || order.id.slice(0, 8).toUpperCase(),
            total: order.total_price || 0,
            status: order.status,
            payment: order.payment_mode,
            time: orderDate
          })
        }
      })

      const topItems = Object.entries(itemCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }))

      const dailyData = Object.keys(dayRevenue).sort().slice(-14).map(day => ({
        day: new Date(day).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        fullDay: day,
        revenue: Math.round(dayRevenue[day]),
        orders: dayOrders[day] || 0
      }))

      const paymentData = [
        { name: 'Pay at Counter', value: paymentModes.counter, fill: CHART_COLORS.counter },
        { name: 'Online Payment', value: paymentModes.online, fill: CHART_COLORS.online }
      ].filter(d => d.value > 0)

      setData({
        orders: allOrders.length,
        revenue: completedOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0),
        pendingRevenue: pendingOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0),
        avgOrderValue: allOrders.length > 0 ? Math.round(completedOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0) / completedOrders.length) : 0,
        itemsSold: Object.values(itemCount).reduce((a, b) => a + b, 0),
        pendingOrders: pendingOrders.length,
        completedOrders: completedOrders.length,
        topItems,
        dailyData,
        paymentData,
        recentActivity: recentActivity.sort((a, b) => b.time - a.time)
      })
    } catch (err) {
      console.error('Analytics error:', err)
      setError(err.message)
      setData(getEmptyData())
    } finally {
      setLoading(false)
    }
  }, [timeRange, getDateRange])

  const getEmptyData = () => ({
    orders: 0, revenue: 0, pendingRevenue: 0, avgOrderValue: 0, itemsSold: 0,
    pendingOrders: 0, completedOrders: 0, topItems: [], dailyData: [], paymentData: [], recentActivity: []
  })

  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const formatCurrency = (val) => `₹${(val || 0).toLocaleString('en-IN')}`
  
  const formatTime = (date) => {
    const now = new Date()
    const diff = now - date
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  }

  const getRangeLabel = () => ({ today: "Today's", '7days': 'Last 7 Days', '30days': 'Last 30 Days', all: 'All Time' }[timeRange])

  const filters = [
    { id: 'today', label: 'Today' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: 'all', label: 'All' }
  ]

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <div className="analytics-header-left">
          <h1 className="analytics-title">Analytics</h1>
          <p className="analytics-subtitle">Track performance and insights</p>
        </div>
        <div className="premium-filter-bar">
          {filters.map(f => (
            <button
              key={f.id}
              className={`premium-filter-btn ${timeRange === f.id ? 'active' : ''}`}
              onClick={() => setTimeRange(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="analytics-loading">
          <div className="premium-kpi-grid">
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="premium-charts-grid">
            <SkeletonChart />
            <SkeletonChart />
          </div>
          <div className="premium-insights-grid">
            <SkeletonChart height={200} />
            <SkeletonChart height={200} />
          </div>
        </div>
      ) : error ? (
        <div className="premium-error">
          <div className="error-icon">⚠️</div>
          <p className="error-title">Unable to load analytics</p>
          <p className="error-message">{error}</p>
          <button className="retry-btn" onClick={loadAnalytics}>Try Again</button>
        </div>
      ) : data ? (
        <>
          <div className="premium-kpi-grid">
            <div className="premium-kpi-card highlight">
              <div className="kpi-icon">💰</div>
              <div className="kpi-body">
                <span className="kpi-label">{getRangeLabel()} Revenue</span>
                <span className="kpi-value">{formatCurrency(data.revenue)}</span>
                {data.pendingRevenue > 0 && <span className="kpi-sub">{formatCurrency(data.pendingRevenue)} pending</span>}
              </div>
            </div>

            <div className="premium-kpi-card">
              <div className="kpi-icon">📦</div>
              <div className="kpi-body">
                <span className="kpi-label">Total Orders</span>
                <span className="kpi-value">{data.orders}</span>
                {data.completedOrders > 0 && <span className="kpi-sub">{data.completedOrders} completed</span>}
              </div>
            </div>

            <div className="premium-kpi-card">
              <div className="kpi-icon">✅</div>
              <div className="kpi-body">
                <span className="kpi-label">Completed</span>
                <span className="kpi-value">{data.completedOrders}</span>
                <span className="kpi-sub">{data.orders > 0 ? Math.round(data.completedOrders / data.orders * 100) : 0}% of total</span>
              </div>
            </div>

            <div className="premium-kpi-card">
              <div className="kpi-icon">📊</div>
              <div className="kpi-body">
                <span className="kpi-label">Avg Order Value</span>
                <span className="kpi-value">{formatCurrency(data.avgOrderValue)}</span>
                <span className="kpi-sub">per order</span>
              </div>
            </div>

            <div className="premium-kpi-card">
              <div className="kpi-icon">🍽️</div>
              <div className="kpi-body">
                <span className="kpi-label">Items Sold</span>
                <span className="kpi-value">{data.itemsSold}</span>
                <span className="kpi-sub">total items</span>
              </div>
            </div>
          </div>

          <div className="premium-charts-grid">
            <div className="premium-chart-section">
              <h3 className="chart-title">Revenue Trend</h3>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.dailyData}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#666" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip 
                      contentStyle={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '8px', fontSize: 12 }}
                      formatter={(value) => [formatCurrency(value), 'Revenue']}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} fill="url(#revenueGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="premium-chart-section">
              <h3 className="chart-title">Order Volume</h3>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.dailyData}>
                    <XAxis dataKey="day" stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '8px', fontSize: 12 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="orders" fill={CHART_COLORS.orders} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="premium-insights-grid">
            <div className="premium-insight-section">
              <h3 className="insight-title">Top Selling Items</h3>
              {data.topItems?.length > 0 ? (
                <div className="top-items-chart">
                  {data.topItems.map((item, idx) => (
                    <div key={item.name} className="top-item-bar">
                      <span className="top-item-rank">{idx + 1}</span>
                      <div className="top-item-track">
                        <div className="top-item-fill" style={{ width: `${(item.count / data.topItems[0].count) * 100}%` }} />
                      </div>
                      <span className="top-item-name">{item.name}</span>
                      <span className="top-item-count">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="premium-empty">No items sold yet</div>
              )}
            </div>

            <div className="premium-insight-section">
              <h3 className="insight-title">Payment Modes</h3>
              {data.paymentData?.length > 0 ? (
                <div className="payment-chart">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={data.paymentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {data.paymentData.map((entry, index) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '8px', fontSize: 12 }}
                      />
                      <Legend verticalAlign="bottom" formatter={(value) => <span style={{ color: '#999', fontSize: 12 }}>{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="premium-empty">No payment data</div>
              )}
            </div>

            <div className="premium-insight-section">
              <h3 className="insight-title">Recent Activity</h3>
              {data.recentActivity?.length > 0 ? (
                <div className="activity-feed">
                  {data.recentActivity.map(order => (
                    <div key={order.id} className="activity-item">
                      <div className={`activity-status ${order.status === 'accepted' ? 'accepted' : 'pending'}`}>
                        {order.status === 'accepted' ? '✓' : '⏳'}
                      </div>
                      <div className="activity-details">
                        <span className="activity-code">#{order.code}</span>
                        <span className="activity-meta">{formatCurrency(order.total)} · {formatTime(order.time)}</span>
                      </div>
                      <span className={`activity-payment ${order.payment?.toLowerCase()}`}>
                        {order.payment === 'online' ? '💳' : '💵'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="premium-empty">No recent activity</div>
              )}
            </div>
          </div>

          {data.orders === 0 && (
            <div className="premium-empty-state">
              <div className="empty-icon">📊</div>
              <p className="empty-title">No orders yet</p>
              <p className="empty-subtitle">Orders will appear here once recorded</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}