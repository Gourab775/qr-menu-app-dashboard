import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { supabase } from '../lib/supabase'

const ACCENT = {
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f59e0b',
  purple: '#8b5cf6',
  background: '#09090b',
  card: '#18181b',
  border: '#27272a',
  text: '#fafafa',
  muted: '#a1a1aa'
}

const CHART_COLORS = {
  revenue: ACCENT.green,
  orders: ACCENT.blue,
  counter: ACCENT.orange,
  online: ACCENT.purple
}

function formatCurrency(v) {
  return '₹' + (v || 0).toLocaleString('en-IN')
}

function getTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return mins + 'm'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + 'h'
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function getDaysInRange(startDate, endDate) {
  const days = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export default function OverviewPage({ restaurantId }) {
  const [filter, setFilter] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState(null)

  const getDateRange = useCallback((range) => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

    switch (range) {
      case 'today': break
      case '7days': start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      case '30days': start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      case 'all': start = new Date(2020, 0, 1); start.setHours(0,0,0,0); break
      default: start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0)
    }
    return { start: start.toISOString(), end: end.toISOString(), startDate: start, endDate: end }
  }, [])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { start, end, startDate, endDate } = getDateRange(filter)

      const { data: orders, error: queryError } = await supabase
        .from('live_orders')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })

      if (queryError) throw new Error(queryError.message)

      const list = Array.isArray(orders) ? orders : []
      
      const allDays = getDaysInRange(startDate, endDate)
      const dailyRev = {}
      const dailyOrd = {}
      
      allDays.forEach(day => {
        const dateKey = day.toISOString().split('T')[0]
        dailyRev[dateKey] = 0
        dailyOrd[dateKey] = 0
      })
      
      list.forEach(o => {
        if (!o?.created_at) return
        const day = new Date(o.created_at).toISOString().split('T')[0]
        dailyRev[day] = (dailyRev[day] || 0) + (Number(o.total_price) || 0)
        dailyOrd[day] = (dailyOrd[day] || 0) + 1
      })

      const completed = list.filter(o => o.status === 'accepted')
      const pending = list.filter(o => o.status !== 'accepted' && o.status !== 'rejected')
      
      const items = {}
      const payments = { counter: 0, online: 0 }
      const recent = []
      
      list.forEach(o => {
        const pm = (o.payment_mode || 'counter').toLowerCase()
        payments[pm === 'online' ? 'online' : 'counter']++

        const orderItems = Array.isArray(o.items) ? o.items : []
        orderItems.forEach(it => {
          if (!it) return
          const name = it.name || 'Item'
          items[name] = (items[name] || 0) + (Number(it.quantity) || 1)
        })

        if (recent.length < 10) {
          recent.push({
            id: o.id,
            code: o.order_code || o.id.slice(0, 8).toUpperCase(),
            total: o.total_price || 0,
            status: o.status,
            time: new Date(o.created_at)
          })
        }
      })

      const topItems = Object.entries(items)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }))

      const chartData = allDays.map(day => {
        const dateKey = day.toISOString().split('T')[0]
        return {
          date: dateKey,
          label: day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          revenue: dailyRev[dateKey] || 0,
          orders: dailyOrd[dateKey] || 0
        }
      })

      const payData = [
        { name: 'Counter', value: payments.counter, fill: CHART_COLORS.counter },
        { name: 'Online', value: payments.online, fill: CHART_COLORS.online }
      ].filter(d => d.value > 0)

      setMetrics({
        ordersTotal: list.length,
        revenueTotal: completed.reduce((s, o) => s + (Number(o.total_price) || 0), 0),
        revenuePending: pending.reduce((s, o) => s + (Number(o.total_price) || 0), 0),
        avgOrder: completed.length ? Math.round(completed.reduce((s, o) => s + (Number(o.total_price) || 0), 0) / completed.length) : 0,
        itemsSold: Object.values(items).reduce((a, b) => a + b, 0),
        completedOrders: completed.length,
        pendingOrders: pending.length,
        topItems,
        chartData,
        payData,
        recentActivity: recent.sort((a, b) => b.time - a.time)
      })
    } catch (err) {
      console.error('Analytics fetch failed:', err)
      setError(err.message)
      setMetrics(emptyState())
    } finally {
      setLoading(false)
    }
  }, [filter, getDateRange])

  const emptyState = () => ({
    ordersTotal: 0, revenueTotal: 0, revenuePending: 0, avgOrder: 0, itemsSold: 0,
    completedOrders: 0, pendingOrders: 0, topItems: [], chartData: [], payData: [], recentActivity: []
  })

  useEffect(() => { fetchAnalytics() }, [fetchAnalytics])

  const fmtPct = (a, b) => b ? Math.round(a / b * 100) : 0

  const tabs = [
    { id: 'today', label: 'Today' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: 'all', label: 'All Time' }
  ]

  const filterLabel = filter === 'today' ? 'Today' : filter === '7days' ? 'Last 7 Days' : filter === '30days' ? 'Last 30 Days' : 'All Time'

  return (
    <div className="saas-dashboard">
      <div className="saas-header">
        <div className="saas-header-left">
          <h1>Analytics</h1>
          <p>Performance insights for {filterLabel}</p>
        </div>
        <div className="saas-filters">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`saas-filter-btn ${filter === t.id ? 'active' : ''}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="saas-loading">
          <div className="saas-kpi-grid">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="saas-kpi-card saas-skel">
                <div className="saas-skel-icon" />
                <div className="saas-skel-content">
                  <div className="saas-skel-line sm" />
                  <div className="saas-skel-line lg" />
                </div>
              </div>
            ))}
          </div>
          <div className="saas-charts-row">
            <div className="saas-chart-card saas-skel"><div className="saas-skel-area" /></div>
            <div className="saas-chart-card saas-skel"><div className="saas-skel-area" /></div>
          </div>
        </div>
      ) : error ? (
        <div className="saas-error">
          <span>!</span>
          <h3>Failed to load analytics</h3>
          <p>{error}</p>
          <button onClick={fetchAnalytics}>Retry</button>
        </div>
      ) : metrics ? (
        <>
          <div className="saas-kpi-grid">
            <div className="saas-kpi-card primary">
              <div className="saas-kpi-icon">R</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Total Revenue</span>
                <span className="saas-kpi-value">{formatCurrency(metrics.revenueTotal)}</span>
                {metrics.revenuePending > 0 && <span className="saas-kpi-sub">{formatCurrency(metrics.revenuePending)} pending</span>}
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">O</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Total Orders</span>
                <span className="saas-kpi-value">{metrics.ordersTotal}</span>
                <span className="saas-kpi-sub">{metrics.completedOrders} completed</span>
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">C</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Completed</span>
                <span className="saas-kpi-value">{metrics.completedOrders}</span>
                <span className="saas-kpi-sub">{fmtPct(metrics.completedOrders, metrics.ordersTotal)}% rate</span>
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">A</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Avg Order</span>
                <span className="saas-kpi-value">{formatCurrency(metrics.avgOrder)}</span>
                <span className="saas-kpi-sub">per order</span>
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">I</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Items Sold</span>
                <span className="saas-kpi-value">{metrics.itemsSold}</span>
                <span className="saas-kpi-sub">total items</span>
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">P</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Pending</span>
                <span className="saas-kpi-value">{metrics.pendingOrders}</span>
                <span className="saas-kpi-sub">awaiting</span>
              </div>
            </div>
          </div>

          <div className="saas-charts-row">
            <div className="saas-chart-card">
              <div className="saas-chart-header">
                <h3>Revenue Trend</h3>
                <span>Daily revenue over time</span>
              </div>
              <div className="saas-chart-body">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={metrics.chartData}>
                    <defs>
                      <linearGradient id="saasRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: 12 }}
                      formatter={(v) => [formatCurrency(v), 'Revenue']}
                      labelStyle={{ color: '#fafafa' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} fill="url(#saasRevGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="saas-chart-card">
              <div className="saas-chart-header">
                <h3>Order Volume</h3>
                <span>Daily order count</span>
              </div>
              <div className="saas-chart-body">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={metrics.chartData}>
                    <XAxis dataKey="label" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: 12 }}
                      labelStyle={{ color: '#fafafa' }}
                    />
                    <Bar dataKey="orders" fill={CHART_COLORS.orders} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="saas-insights-row">
            <div className="saas-insight-card">
              <div className="saas-insight-header">
                <h3>Top Selling Items</h3>
              </div>
              {metrics.topItems?.length ? (
                <div className="saas-top-items">
                  {metrics.topItems.map((item, i) => (
                    <div key={item.name} className="saas-top-item">
                      <span className="saas-rank">{i + 1}</span>
                      <div className="saas-bar-track">
                        <div className="saas-bar-fill" style={{ width: (item.count / metrics.topItems[0].count) * 100 + '%' }} />
                      </div>
                      <span className="saas-item-name">{item.name}</span>
                      <span className="saas-item-count">{item.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="saas-empty">No data available</div>
              )}
            </div>

            <div className="saas-insight-card">
              <div className="saas-insight-header">
                <h3>Payment Modes</h3>
              </div>
              {metrics.payData?.length ? (
                <div className="saas-pie-wrap">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={metrics.payData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {metrics.payData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6 }} />
                      <Legend verticalAlign="bottom" formatter={v => <span style={{ color: '#a1a1aa', fontSize: 12 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="saas-empty">No payment data</div>
              )}
            </div>

            <div className="saas-insight-card">
              <div className="saas-insight-header">
                <h3>Recent Orders</h3>
              </div>
              {metrics.recentActivity?.length ? (
                <div className="saas-activity">
                  {metrics.recentActivity.map(o => (
                    <div key={o.id} className="saas-activity-item">
                      <div className={`saas-status-dot ${o.status === 'accepted' ? 'success' : o.status === 'rejected' ? 'error' : 'pending'}`}>
                        {o.status === 'accepted' ? '✓' : o.status === 'rejected' ? '×' : '○'}
                      </div>
                      <div className="saas-activity-info">
                        <span>#{o.code}</span>
                        <span>{formatCurrency(o.total)} • {getTimeAgo(o.time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="saas-empty">No recent activity</div>
              )}
            </div>
          </div>

          {metrics.ordersTotal === 0 && (
            <div className="saas-empty-state">
              <span>���</span>
              <h3>No orders recorded</h3>
              <p>Orders will appear here once placed</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}