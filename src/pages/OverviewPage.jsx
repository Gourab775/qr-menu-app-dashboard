import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

export default function OverviewPage({ restaurantId }) {
  const [timeRange, setTimeRange] = useState('today')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const currentRestId = restaurantId || RESTAURANT_ID

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      let startDate = new Date(todayStart)
      let endDate = new Date(todayStart)
      endDate.setHours(23, 59, 59, 999)
      
      if (timeRange === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      } else if (timeRange === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      }
      
      const startISO = startDate.toISOString()
      const endISO = endDate.toISOString()

      const { data: orders, error: queryError } = await supabase
        .from('live_orders')
        .select('*')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false })

      if (queryError) {
        throw new Error(queryError.message || 'Failed to fetch orders')
      }

      const allOrders = Array.isArray(orders) ? orders : []
      
      if (allOrders.length === 0) {
        setData({
          orders: 0,
          revenue: 0,
          avgOrderValue: 0,
          itemsSold: 0,
          pendingOrders: 0,
          completedOrders: 0,
          dailyAvg: 0,
          peakHour: null,
          peakDay: null,
          topItems: [],
          hourlyData: [],
          dailyData: []
        })
        return
      }
      
      const pendingOrders = allOrders.filter(o => o.status !== 'accepted' && o.status !== 'rejected')
      const completedOrders = allOrders.filter(o => o.status === 'accepted')
      const totalOrders = allOrders.length
      const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0)
      const pendingRevenue = pendingOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0)

      const itemCount = {}
      const hourCount = {}
      const dayCount = {}
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      
      allOrders.forEach(order => {
        if (!order || !order.created_at) return
        
        const orderDate = new Date(order.created_at)
        if (isNaN(orderDate.getTime())) return
        
        const hour = orderDate.getHours()
        const day = orderDate.getDay()
        
        hourCount[hour] = (hourCount[hour] || 0) + 1
        dayCount[day] = (dayCount[day] || 0) + 1
        
        const items = Array.isArray(order.items) ? order.items : []
        items.forEach(item => {
          if (!item) return
          const name = item.name || 'Unknown'
          const qty = Number(item.quantity) || 1
          itemCount[name] = (itemCount[name] || 0) + qty
        })
      })

      const sortedItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1])
      const topItems = sortedItems.slice(0, 5).map(([name, count]) => ({ name, count }))
      const itemsSold = Object.values(itemCount).reduce((a, b) => a + b, 0)
      
      const sortedHours = Object.entries(hourCount).sort((a, b) => b[1] - a[1])
      const peakHourEntry = sortedHours[0]
      
      const sortedDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1])
      const peakDayEntry = sortedDays[0]

      let dailyAvg = 0
      let hourlyData = []
      let dailyData = []
      
      if (timeRange === 'week' || timeRange === 'month') {
        const currentDay = timeRange === 'month' ? now.getDate() : 7
        dailyAvg = currentDay > 0 ? Math.round(totalOrders / currentDay) : 0

        for (let h = 0; h < 24; h++) {
          hourlyData.push({
            hour: h,
            label: `${h}:00`,
            orders: hourCount[h] || 0
          })
        }

        let daysInRange = 7
        if (timeRange === 'month') {
          daysInRange = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        }
        
        const periodDailyOrders = {}
        
        allOrders.forEach(order => {
          if (!order || !order.created_at) return
          const orderDate = new Date(order.created_at)
          if (isNaN(orderDate.getTime())) return
          const day = orderDate.getDate()
          periodDailyOrders[day] = (periodDailyOrders[day] || 0) + 1
        })
        
        for (let d = 1; d <= daysInRange; d++) {
          dailyData.push({
            day: d,
            label: d,
            orders: periodDailyOrders[d] || 0
          })
        }
      } else {
        for (let h = 0; h < 24; h++) {
          hourlyData.push({
            hour: h,
            label: `${h}:00`,
            orders: hourCount[h] || 0
          })
        }
      }

      setData({
        orders: totalOrders,
        revenue: totalRevenue,
        pendingRevenue,
        avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
        itemsSold,
        pendingOrders: pendingOrders.length,
        completedOrders: completedOrders.length,
        dailyAvg,
        peakHour: peakHourEntry ? `${peakHourEntry[0]}:00` : null,
        peakDay: peakDayEntry ? dayNames[peakDayEntry[0]] : null,
        topItems,
        hourlyData,
        dailyData
      })
    } catch (err) {
      console.error('Analytics error:', err)
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  const isToday = timeRange === 'today'
  const isWeek = timeRange === 'week'
  const isMonth = timeRange === 'month'

  const handleRefresh = () => {
    loadAnalytics()
  }

  const getRangeLabel = () => {
    if (isToday) return 'Today'
    if (isWeek) return 'This Week'
    return 'This Month'
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page-header">
        <h1 className="page-main-title">Analytics</h1>
        <button 
          onClick={handleRefresh} 
          className="refresh-btn-small" 
          title="Refresh"
          disabled={loading}
        >
          <span className={loading ? 'spin' : ''}>↻</span>
        </button>
      </div>

      <div className="time-range-tabs">
        <button 
          className={`time-range-tab ${timeRange === 'today' ? 'active' : ''}`}
          onClick={() => setTimeRange('today')}
        >
          Today
        </button>
        <button 
          className={`time-range-tab ${timeRange === 'week' ? 'active' : ''}`}
          onClick={() => setTimeRange('week')}
        >
          This Week
        </button>
        <button 
          className={`time-range-tab ${timeRange === 'month' ? 'active' : ''}`}
          onClick={() => setTimeRange('month')}
        >
          This Month
        </button>
      </div>

      {loading && (
        <div className="analytics-loading">
          <div className="skeleton-grid">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton-card-stat">
                <div className="skeleton-line" style={{width: '40%'}}></div>
                <div className="skeleton-line" style={{width: '60%'}}></div>
                <div className="skeleton-line short" style={{width: '30%'}}></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="analytics-error">
          <div className="error-icon">⚠️</div>
          <p className="error-title">Unable to load analytics</p>
          <p className="error-message">{error}</p>
          <button className="retry-btn" onClick={handleRefresh}>Try Again</button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="analytics-section">
            <h3 className="section-title">Performance</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-label">Total Orders</span>
                  <span className="stat-badge">{getRangeLabel()}</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-value-large">{data.orders}</span>
                </div>
                {(isWeek || isMonth) && data.dailyAvg > 0 && (
                  <div className="stat-meta">{data.dailyAvg} avg/day</div>
                )}
              </div>

              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-label">Revenue</span>
                  <span className="stat-badge success">Confirmed</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-value-large">₹{Number(data.revenue || 0).toLocaleString()}</span>
                </div>
                {(data.pendingOrders || 0) > 0 && (
                  <div className="stat-meta pending">₹{Number(data.pendingRevenue || 0).toLocaleString()} pending</div>
                )}
              </div>

              <div className="stat-card">
                <div className="stat-label-row">
                  <span className="stat-label">Avg Order Value</span>
                </div>
                <div className="stat-value-row">
                  <span className="stat-value-large">₹{Number(data.avgOrderValue || 0)}</span>
                </div>
                <div className="stat-meta">{data.completedOrders || 0} completed</div>
              </div>
            </div>
          </div>

          {data.hourlyData && data.hourlyData.length > 0 && (
            <div className="analytics-section">
              <h3 className="section-title">Revenue Trend</h3>
              <div className="revenue-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.hourlyData}>
                    <XAxis 
                      dataKey="hour" 
                      stroke="#888" 
                      fontSize={12}
                      tickFormatter={(val) => val}
                    />
                    <YAxis 
                      stroke="#888" 
                      fontSize={12}
                      tickFormatter={(val) => `₹${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                      formatter={(value) => [`₹${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.dailyData && data.dailyData.length > 0 && isMonth && (
            <div className="analytics-section">
              <h3 className="section-title">Daily Orders</h3>
              <div className="revenue-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.dailyData}>
                    <XAxis 
                      dataKey="day" 
                      stroke="#888" 
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="#888" 
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="orders" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {(isWeek || isMonth) && (
            <div className="analytics-section">
              <h3 className="section-title">{isWeek ? 'Weekly' : 'Monthly'} Insights</h3>
              <div className="stats-grid three-col">
                <div className="stat-card small">
                  <span className="stat-label">Items Sold</span>
                  <span className="stat-value-medium">{data.itemsSold || 0}</span>
                </div>
                <div className="stat-card small">
                  <span className="stat-label">Peak Hour</span>
                  <span className="stat-value-medium">{data.peakHour || '-'}</span>
                </div>
                <div className="stat-card small">
                  <span className="stat-label">Best Day</span>
                  <span className="stat-value-medium">{data.peakDay || '-'}</span>
                </div>
              </div>
            </div>
          )}

          {data.topItems && data.topItems.length > 0 && (
            <div className="analytics-section">
              <h3 className="section-title">Top Selling Items</h3>
              <div className="top-items-list-compact">
                {data.topItems.map((item, index) => (
                  <div key={item?.name || index} className="top-item-row">
                    <span className="top-item-rank">{index + 1}</span>
                    <span className="top-item-name">{item?.name || 'Unknown'}</span>
                    <span className="top-item-count">{item?.count || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(isWeek || isMonth) && data.dailyData && data.dailyData.length > 0 && (
            <div className="analytics-section">
              <h3 className="section-title">Daily Orders</h3>
              <div className="mini-chart">
                {data.dailyData.map((d) => {
                  const maxOrders = Math.max(...(data.dailyData?.map(x => x?.orders || 0) || [1]))
                  const heightPercent = maxOrders > 0 ? (d?.orders || 0) / maxOrders * 100 : 0
                  return (
                    <div 
                      key={d?.day || 0}
                      className="mini-bar" 
                      style={{ 
                        height: `${Math.max(4, heightPercent)}%`
                      }}
                      title={`Day ${d?.day || 0}: ${d?.orders || 0} orders`}
                    />
                  )
                })}
              </div>
              <div className="mini-chart-labels">
                <span>1</span>
                <span>{data.dailyData.length}</span>
              </div>
            </div>
          )}

          {data.orders === 0 && (
            <div className="analytics-empty">
              <div className="empty-icon">📊</div>
              <p className="empty-title">No orders yet</p>
              <p className="empty-subtitle">
                {isMonth ? 'No orders recorded this month' : isWeek ? 'No orders recorded this week' : 'No orders recorded today'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
