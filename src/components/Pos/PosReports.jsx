import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconBarChart, IconCalendar } from '../../components/Icons'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (Math.round(v) || 0).toLocaleString('en-IN')
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'weekly', label: 'This Week' },
  { id: 'monthly', label: 'This Month' },
]

function getPeriodRange(periodId) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (periodId === 'today') {
    return {
      start: `${today}T00:00:00.000Z`,
      end: `${today}T23:59:59.999Z`,
    }
  }
  if (periodId === 'weekly') {
    const dayOfWeek = now.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - diff)
    return {
      start: monday.toISOString().slice(0, 10) + 'T00:00:00.000Z',
      end: `${today}T23:59:59.999Z`,
    }
  }
  if (periodId === 'monthly') {
    return {
      start: now.toISOString().slice(0, 7) + '-01T00:00:00.000Z',
      end: `${today}T23:59:59.999Z`,
    }
  }
  return { start: '', end: '' }
}

export default function PosReports({ restaurantId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activePeriod, setActivePeriod] = useState('today')

  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    loadData()
    return () => { mountedRef.current = false }
  }, [restaurantId])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('id, total_price, items, status, created_at, note')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .order('created_at', { ascending: false }),
        API_TIMEOUT
      )
      if (!mountedRef.current) return
      if (queryError) throw queryError
      setOrders(data || [])
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Failed to load reports')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const periodRange = useMemo(() => getPeriodRange(activePeriod), [activePeriod])

  const { periodSales, periodOrders, periodItems, topItems, allTimeRevenue, paymentSummary } = useMemo(() => {
    const completed = orders.filter(o => o.status === 'completed')

    const periodCompleted = completed.filter(o => {
      const d = new Date(o.created_at).toISOString()
      return d >= periodRange.start && d <= periodRange.end
    })

    const periodSalesTotal = periodCompleted.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    const periodOrderCount = periodCompleted.length

    const itemCounts = {}
    let periodItemsSold = 0
    const paymentMethods = {}

    periodCompleted.forEach(order => {
      if (!Array.isArray(order.items)) return
      const meta = order.items.find(i => i._pos_meta)
      const method = meta?.payment_method || (order.note?.includes('CASH') ? 'cash' : order.note?.includes('UPI') ? 'upi' : order.note?.includes('CARD') ? 'card' : 'other')
      paymentMethods[method] = (paymentMethods[method] || 0) + (Number(order.total_price) || 0)

      order.items.forEach(item => {
        if (item._pos_meta) return
        const name = item.name || 'Item'
        const qty = item.quantity || 1
        itemCounts[name] = (itemCounts[name] || 0) + qty
        periodItemsSold += qty
      })
    })

    const sortedItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))

    const allRevenue = completed.reduce((s, o) => s + (Number(o.total_price) || 0), 0)

    return {
      periodSales: periodSalesTotal,
      periodOrders: periodOrderCount,
      periodItems: periodItemsSold,
      topItems: sortedItems,
      allTimeRevenue: allRevenue,
      paymentSummary: paymentMethods,
    }
  }, [orders, periodRange])

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
        <h2>Sales Reports</h2>
        <div className="pos-reports-period-bar">
          {PERIODS.map(p => (
            <button
              key={p.id}
              className={`pos-reports-period-btn ${activePeriod === p.id ? 'active' : ''}`}
              onClick={() => setActivePeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pos-reports-grid">
        <div className="pos-report-card sales">
          <div className="label">Sales</div>
          <div className="value">{formatCurrency(periodSales)}</div>
          <div className="sub">{activePeriod === 'today' ? 'Today' : activePeriod === 'weekly' ? 'This week' : 'This month'}</div>
        </div>
        <div className="pos-report-card orders">
          <div className="label">Orders</div>
          <div className="value">{periodOrders}</div>
          <div className="sub">Bills completed</div>
        </div>
        <div className="pos-report-card items">
          <div className="label">Items Sold</div>
          <div className="value">{periodItems}</div>
          <div className="sub">Total items</div>
        </div>
      </div>

      {Object.keys(paymentSummary).length > 0 && (
        <div className="pos-report-section" style={{ flexShrink: 0, marginBottom: 12 }}>
          <h3>Payment Summary</h3>
          <div className="pos-payment-summary">
            {Object.entries(paymentSummary).map(([method, amount]) => (
              <div key={method} className="pos-payment-summary-row">
                <span className="pos-payment-summary-method">{method.toUpperCase()}</span>
                <div className="pos-payment-summary-bar-wrap">
                  <div
                    className="pos-payment-summary-bar"
                    style={{ width: `${(amount / periodSales) * 100}%` }}
                  />
                </div>
                <span className="pos-payment-summary-amount">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pos-report-section">
        <h3>Best Selling Items ({activePeriod === 'today' ? 'Today' : activePeriod === 'weekly' ? 'This Week' : 'All Time'})</h3>
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