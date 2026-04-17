import { useState, useEffect, useCallback } from 'react'
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

const ACCENT = {
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f59e0b',
  purple: '#8b5cf6',
  red: '#ef4444',
  background: '#0a0a0a',
  card: '#141414',
  border: '#262626',
  text: '#fafafa',
  muted: '#737373'
}

const CHART_COLORS = {
  revenue: ACCENT.green,
  orders: ACCENT.blue,
  counter: ACCENT.orange,
  online: ACCENT.purple
}

const KPICardSkel = () => (
  <div className="saas-kpi-card skel">
    <div className="skel-circle" />
    <div className="saas-kpi-content">
      <div className="skel-line sm" />
      <div className="skel-line lg" />
      <div className="skel-line xs" />
    </div>
  </div>
)

const ChartSkel = () => (
  <div className="saas-chart-card skel">
    <div className="saas-chart-header">
      <div className="skel-line md" />
      <div className="skel-line sm" />
    </div>
    <div className="skel-area" />
  </div>
)

const InsightSkel = () => (
  <div className="saas-insight-card skel">
    <div className="skel-line md" />
    {[1,2,3,4,5].map(i => <div key={i} className="skel-row" />)}
  </div>
)

function getTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

export default function OverviewPage({ restaurantId }) {
  const [filter, setFilter] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState(null)

  const getDateRange = useCallback((range) => {
    const now = new Date()
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    let end = new Date(now)
    end.setHours(23, 59, 59, 999)

    switch (range) {
      case 'today': break
      case '7days': start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
      case '30days': start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
      case 'all': start = new Date(2020, 0, 1); break
      default: start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }
    return { start: start.toISOString(), end: end.toISOString() }
  }, [])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange(filter)

      const { data: orders, error: queryError } = await supabase
        .from('live_orders')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })

      if (queryError) throw new Error(queryError.message)

      const list = Array.isArray(orders) ? orders : []
      
      if (!list.length) {
        setMetrics(emptyState())
        return
      }
      
      const completed = list.filter(o => o.status === 'accepted')
      const pending = list.filter(o => o.status !== 'accepted' && o.status !== 'rejected')
      
      const items = {}
      const dailyRev = {}
      const dailyOrd = {}
      const payments = { counter: 0, online: 0 }
      const recent = []
      
      list.forEach(o => {
        if (!o?.created_at) return
        
        const day = new Date(o.created_at).toISOString().split('T')[0]
        dailyRev[day] = (dailyRev[day] || 0) + (Number(o.total_price) || 0)
        dailyOrd[day] = (dailyOrd[day] || 0) + 1
        
        const pm = (o.payment_mode || 'counter').toLowerCase()
        payments[pm === 'online' ? 'online' : 'counter']++

        const orderItems = Array.isArray(o.items) ? o.items : []
        orderItems.forEach(it => {
          if (!it) return
          const name = it.name || 'Item'
          items[name] = (items[name] || 0) + (Number(it.quantity) || 1)
        })

        if (recent.length < 8) {
          recent.push({
            id: o.id,
            code: o.order_code || o.id.slice(0, 8).toUpperCase(),
            total: o.total_price || 0,
            status: o.status,
            payment: o.payment_mode,
            time: new Date(o.created_at)
          })
        }
      })

      const topItems = Object.entries(items)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }))

      const chartData = Object.keys(dailyRev).sort().slice(-14).map(d => ({
        date: d,
        label: new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        revenue: Math.round(dailyRev[d]),
        orders: dailyOrd[d] || 0
      }))

      const payData = [
        { name: 'Pay at Counter', value: payments.counter, fill: CHART_COLORS.counter },
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

  const fmt = (v) => `₹${(v || 0).toLocaleString('en-IN')}`
  const fmtPct = (a, b) => b ? Math.round(a / b * 100) : 0

  const tabs = [
    { id: 'today', label: 'Today' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: 'all', label: 'All Time' }
  ]

  return (
    <div className="saas-dashboard">
      <div className="saas-header">
        <div className="saas-header-title">
          <h1>Analytics</h1>
          <p>Performance insights and metrics</p>
        </div>
        <div className="saas-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`saas-tab ${filter === t.id ? 'active' : ''}`}
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
            {[...Array(5)].map(i => <KPICardSkel key={i} />)}
          </div>
          <div className="saas-row">
            <ChartSkel />
            <ChartSkel />
          </div>
          <div className="saas-row">
            <InsightSkel />
            <InsightSkel />
            <InsightSkel />
          </div>
        </div>
      ) : error ? (
        <div className="saas-error">
          <span className="saas-error-icon">⚠️</span>
          <h3>Failed to load analytics</h3>
          <p>{error}</p>
          <button className="saas-retry" onClick={fetchAnalytics}>Retry</button>
        </div>
      ) : metrics ? (
        <>
          <div className="saas-kpi-grid">
            <div className="saas-kpi-card primary-glow">
              <div className="saas-kpi-icon">💰</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">{filter === 'today' ? "Today's" : filter === '7days' ? 'Last 7 Days' : filter === '30days' ? 'Last 30 Days' : 'All Time'} Revenue</span>
                <span className="saas-kpi-value">{fmt(metrics.revenueTotal)}</span>
                {metrics.revenuePending > 0 && <span className="saas-kpi-sub">{fmt(metrics.revenuePending)} pending</span>}
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">📦</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Total Orders</span>
                <span className="saas-kpi-value">{metrics.ordersTotal}</span>
                {metrics.completedOrders > 0 && <span className="saas-kpi-sub">{metrics.completedOrders} completed</span>}
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">✅</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Completed</span>
                <span className="saas-kpi-value">{metrics.completedOrders}</span>
                <span className="saas-kpi-sub">{fmtPct(metrics.completedOrders, metrics.ordersTotal)}% of total</span>
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">📊</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Avg Order Value</span>
                <span className="saas-kpi-value">{fmt(metrics.avgOrder)}</span>
                <span className="saas-kpi-sub">per order</span>
              </div>
            </div>

            <div className="saas-kpi-card">
              <div className="saas-kpi-icon">🍽️</div>
              <div className="saas-kpi-content">
                <span className="saas-kpi-label">Items Sold</span>
                <span className="saas-kpi-value">{metrics.itemsSold}</span>
                <span className="saas-kpi-sub">total items</span>
              </div>
            </div>
          </div>

          <div className="saas-row">
            <div className="saas-chart-card">
              <div className="saas-chart-header">
                <h3>Revenue Trend</h3>
                <span className="saas-chart-sub">Daily revenue over time</span>
              </div>
              <div className="saas-chart-body">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={metrics.chartData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} />
                    <Tooltip 
                      contentStyle={{ background: '#1c1c1c', border: '1px solid #333', borderRadius: '8px', fontSize: 12 }}
                      formatter={v => [fmt(v), 'Revenue']}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="saas-chart-card">
              <div className="saas-chart-header">
                <h3>Order Volume</h3>
                <span className="saas-chart-sub">Daily order count</span>
              </div>
              <div className="saas-chart-body">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.chartData}>
                    <XAxis dataKey="label" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ background: '#1c1c1c', border: '1px solid #333', borderRadius: '8px', fontSize: 12 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="orders" fill={CHART_COLORS.orders} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="saas-row three-col">
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
                        <div className="saas-bar-fill" style={{ width: `${(item.count / metrics.topItems[0].count) * 100}%` }} />
                      </div>
                      <span className="saas-name">{item.name}</span>
                      <span className="saas-count">{item.count}</span>
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
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={metrics.payData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {metrics.payData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#1c1c1c', border: '1px solid #333', borderRadius: 6 }} />
                      <Legend verticalAlign="bottom" formatter={v => <span style={{ color: '#888', fontSize: 11 }}>{v}</span>} />
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
                        {o.status === 'accepted' ? '✓' : o.status === 'rejected' ? '✕' : '○'}
                      </div>
                      <div className="saas-activity-info">
                        <span className="saas-activity-code">#{o.code}</span>
                        <span className="saas-activity-meta">{fmt(o.total)} · {getTimeAgo(o.time)}</span>
                      </div>
                      <span className="saas-activity-pay">{o.payment === 'online' ? '💳' : '💵'}</span>
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
              <span className="saas-empty-icon">📊</span>
              <h3>No orders recorded</h3>
              <p>Orders will appear here once placed</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}