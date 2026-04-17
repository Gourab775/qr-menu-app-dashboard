import { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend 
} from 'recharts'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

const COLORS = {
  primary: '#22c55e',
  secondary: '#3b82f6',
  tertiary: '#f59e0b',
  quaternary: '#ef4444',
  muted: '#6b7280',
  card: '#1a1a1a',
  background: '#111'
}

const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

const SkeletonCard = ({ width = '100%', height = '80px' }) => (
  <div className="kpi-card" style={{ height }}>
    <div className="skeleton-line" style={{ width: '40%', height: 12, marginBottom: 8 }} />
    <div className="skeleton-line" style={{ width: '60%', height: 28, marginBottom: 8 }} />
    <div className="skeleton-line short" style={{ width: '30%', height: 10 }} />
  </div>
)

const SkeletonChart = () => (
  <div className="analytics-section">
    <div className="section-title-skeleton" style={{ width: '30%', height: 20, marginBottom: 16 }} />
    <div style={{ width: '100%', height: 200 }}>
      <div className="skeleton-line" style={{ width: '100%', height: '100%' }} />
    </div>
  </div>
)

export default function OverviewPage({ restaurantId }) {
  const [timeRange, setTimeRange] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const currentRestId = restaurantId || RESTAURANT_ID

  const getDateRange = useCallback((range) => {
    const now = new Date()
    let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    let endDate = new Date(now)
    endDate.setHours(23, 59, 59, 999)

    switch (range) {
      case 'today':
        break
      case '7days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'all':
        startDate = new Date(2020, 0, 1)
        break
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
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

      if (queryError) {
        throw new Error(queryError.message || 'Failed to fetch orders')
      }

      const allOrders = Array.isArray(orders) ? orders : []
      
      if (allOrders.length === 0) {
        setData(getEmptyData())
        return
      }
      
      const pendingOrders = allOrders.filter(o => o.status !== 'accepted' && o.status !== 'rejected')
      const completedOrders = allOrders.filter(o => o.status === 'accepted')
      const totalOrders = allOrders.length
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0)
      const pendingRevenue = pendingOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0)

      const itemCount = {}
      const hourRevenue = {}
      const dayRevenue = {}
      const dayOrders = {}
      const paymentModes = { counter: 0, online: 0 }
      const recentActivity = []
      
      allOrders.forEach(order => {
        if (!order || !order.created_at) return
        
        const orderDate = new Date(order.created_at)
        if (isNaN(orderDate.getTime())) return
        
        const hour = orderDate.getHours()
        const dayKey = orderDate.toISOString().split('T')[0]
        
        hourRevenue[hour] = (hourRevenue[hour] || 0) + (Number(order.total_price) || 0)
        dayRevenue[dayKey] = (dayRevenue[dayKey] || 0) + (Number(order.total_price) || 0)
        dayOrders[dayKey] = (dayOrders[dayKey] || 0) + 1
        
        const pm = (order.payment_mode || 'counter').toLowerCase()
        paymentModes[pm === 'online' ? 'online' : 'counter']++

        const items = Array.isArray(order.items) ? order.items : []
        items.forEach(item => {
          if (!item) return
          const name = item.name || 'Unknown'
          const qty = Number(item.quantity) || 1
          itemCount[name] = (itemCount[name] || 0) + qty
        })

        if (recentActivity.length < 10) {
          recentActivity.push({
            id: order.id,
            code: order.order_code || order.id.slice(0, 8).toUpperCase(),
            total: order.total_price || 0,
            status: order.status,
            time: orderDate
          })
        }
      })

      const sortedItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1])
      const topItems = sortedItems.slice(0, 8).map(([name, count]) => ({ name, count }))

      const hourlyData = Object.entries(hourRevenue).map(([hour, revenue]) => ({
        hour: `${hour}:00`,
        revenue: Math.round(revenue)
      })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))

      const dailyData = Object.keys(dayRevenue).sort().slice(-14).map(day => ({
        day: new Date(day).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        revenue: Math.round(dayRevenue[day]),
        orders: dayOrders[day] || 0
      }))

      const paymentData = [
        { name: 'Pay at Counter', value: paymentModes.counter, color: COLORS.tertiary },
        { name: 'Online Payment', value: paymentModes.online, color: COLORS.secondary }
      ].filter(d => d.value > 0)

      setData({
        orders: totalOrders,
        revenue: totalRevenue,
        pendingRevenue,
        avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
        itemsSold: Object.values(itemCount).reduce((a, b) => a + b, 0),
        pendingOrders: pendingOrders.length,
        completedOrders: completedOrders.length,
        topItems,
        hourlyData,
        dailyData,
        paymentData,
        recentActivity
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
    orders: 0,
    revenue: 0,
    pendingRevenue: 0,
    avgOrderValue: 0,
    itemsSold: 0,
    pendingOrders: 0,
    completedOrders: 0,
    topItems: [],
    hourlyData: [],
    dailyData: [],
    paymentData: [],
    recentActivity: []
  })

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const handleRefresh = () => loadAnalytics()

  const formatCurrency = (val) => `₹${(val || 0).toLocaleString('en-IN')}`

  const getRangeLabel = () => {
    switch (timeRange) {
      case 'today': return "Today's"
      case '7days': return 'Last 7 Days'
      case '30days': return 'Last 30 Days'
      case 'all': return 'All Time'
      default: return 'Last 7 Days'
    }
  }

  const isToday = timeRange === 'today'
  const isWeek = timeRange === '7days'
  const isMonth = timeRange === '30days'

  const filters = [
    { id: 'today', label: 'Today' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: 'all', label: 'All' }
  ]

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h2 className="analytics-title">Analytics</h2>
        <div className="analytics-filters">
          {filters.map(f => (
            <button
              key={f.id}
              className={`filter-pill ${timeRange === f.id ? 'active' : ''}`}
              onClick={() => setTimeRange(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="analytics-loading">
          <div className="kpi-grid">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : error ? (
        <div className="analytics-error">
          <div className="error-icon">⚠️</div>
          <p className="error-title">Unable to load analytics</p>
          <p className="error-message">{error}</p>
          <button className="retry-btn" onClick={handleRefresh}>Try Again</button>
        </div>
      ) : data ? (
        <>
          <div className="kpi-grid">
            <div className="kpi-card primary">
              <div className="kpi-icon">💰</div>
              <div className="kpi-content">
                <span className="kpi-label">{getRangeLabel()} Revenue</span>
                <span className="kpi-value">{formatCurrency(data.revenue)}</span>
                {data.pendingRevenue > 0 && (
                  <span className="kpi-meta">{formatCurrency(data.pendingRevenue)} pending</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon">📦</div>
              <div className="kpi-content">
                <span className="kpi-label">Total Orders</span>
                <span className="kpi-value">{data.orders}</span>
                {data.completedOrders > 0 && (
                  <span className="kpi-meta">{data.completedOrders} completed</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon">✅</div>
              <div className="kpi-content">
                <span className="kpi-label">Completed</span>
                <span className="kpi-value">{data.completedOrders}</span>
                <span className="kpi-meta">
                  {data.orders > 0 ? Math.round(data.completedOrders / data.orders * 100) : 0}% of total
                </span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon">📊</div>
              <div className="kpi-content">
                <span className="kpi-label">Avg Order Value</span>
                <span className="kpi-value">{formatCurrency(data.avgOrderValue)}</span>
                <span className="kpi-meta">per order</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon">🍽️</div>
              <div className="kpi-content">
                <span className="kpi-label">Items Sold</span>
                <span className="kpi-value">{data.itemsSold}</span>
                <span className="kpi-meta">total items</span>
              </div>
            </div>
          </div>

          {data.dailyData && data.dailyData.length > 0 && (
            <div className="analytics-section">
              <h3 className="section-title">Revenue Trend</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.dailyData}>
                    <XAxis 
                      dataKey="day" 
                      stroke="#666" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#666" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `₹${v}`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        fontSize: 12
                      }}
                      formatter={(value) => [formatCurrency(value), 'Revenue']}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke={COLORS.primary}
                      strokeWidth={2}
                      dot={{ fill: COLORS.primary, strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, fill: COLORS.primary }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.dailyData && data.dailyData.length > 0 && (
            <div className="analytics-section">
              <h3 className="section-title">Order Count</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.dailyData}>
                    <XAxis 
                      dataKey="day" 
                      stroke="#666" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#666" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        fontSize: 12
                      }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="orders" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.paymentData && data.paymentData.length > 0 && (
            <div className="analytics-section half">
              <h3 className="section-title">Payment Modes</h3>
              <div className="chart-container-small">
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
                        <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        background: '#1a1a1a', 
                        border: '1px solid #333', 
                        borderRadius: '8px',
                        fontSize: 12
                      }}
                    />
                    <Legend 
                      verticalAlign="bottom"
                      formatter={(value) => <span style={{ color: '#999', fontSize: 12 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.topItems && data.topItems.length > 0 && (
            <div className="analytics-section half">
              <h3 className="section-title">Top Selling Items</h3>
              <div className="top-items-list">
                {data.topItems.map((item, index) => (
                  <div key={item.name} className="top-item-row">
                    <span className="top-item-rank">{index + 1}</span>
                    <span className="top-item-name">{item.name}</span>
                    <span className="top-item-count">{item.count} sold</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.orders === 0 && (
            <div className="analytics-empty">
              <div className="empty-icon">📊</div>
              <p className="empty-title">No orders yet</p>
              <p className="empty-subtitle">
                {isToday ? 'No orders recorded today' : 
                 isWeek ? 'No orders in the last 7 days' : 
                 isMonth ? 'No orders in the last 30 days' : 
                 'No orders recorded'}
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}