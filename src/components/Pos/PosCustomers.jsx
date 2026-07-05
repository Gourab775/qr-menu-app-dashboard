import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconUsers, IconSearch, IconPhone, IconClipboard } from '../Icons'
import { formatOrderDateTime } from '../../utils/formatDateTime'
import { useFormatCurrency } from '../../hooks/useFormatCurrency'

const API_TIMEOUT = 30000

export default function PosCustomers({ restaurantId }) {
  const formatCurrency = useFormatCurrency()
  const [customers, setCustomers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`pos_customers_${restaurantId}`) || '[]')
    } catch { return [] }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const mountedRef = useRef(false)

  const CUSTOMERS_KEY = `pos_customers_${restaurantId}`

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const saveCustomers = (updated) => {
    try {
      localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(updated))
      setCustomers(updated)
    } catch {}
  }

  const handleAddCustomer = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const phone = newPhone.trim().replace(/\D/g, '')
    const exists = customers.find(c => c.phone && c.phone === phone)
    if (exists) {
      alert('Customer with this phone number already exists')
      return
    }
    const customer = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: newName.trim(),
      phone: phone || '',
      orderCount: 0,
      lastVisit: null,
      createdAt: new Date().toISOString(),
    }
    saveCustomers([...customers, customer])
    setNewName('')
    setNewPhone('')
    setShowAddForm(false)
  }

  const handleViewOrders = async (customer) => {
    setSelectedCustomer(customer)
    setOrdersLoading(true)
    setCustomerOrders([])
    try {
      const customerNote = customer.phone
        ? `%${customer.phone}%`
        : `%${customer.name}%`

      const itemsMeta = Array.isArray(customerOrders) ? customerOrders : []
      const { data } = await fetchWithTimeout(
        supabase
          .from('live_orders')
          .select('id, order_code, total_price, items, status, created_at, note')
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'pos')
          .or(`note.ilike.${customerNote},items.cs.{"customer_name":"${customer.name}"}`)
          .order('created_at', { ascending: false })
          .limit(50),
        API_TIMEOUT
      )
      if (!mountedRef.current) return
      setCustomerOrders(data || [])
    } catch (err) {
      console.error('Failed to load customer orders:', err)
    } finally {
      if (mountedRef.current) setOrdersLoading(false)
    }
  }

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers
    const q = searchQuery.toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    )
  }, [customers, searchQuery])

  const customerStats = useMemo(() => {
    return {
      total: customers.length,
      withPhone: customers.filter(c => c.phone).length,
    }
  }, [customers])

  return (
    <div className="pos-customers-page">
      <div className="pos-customers-header">
        <div className="pos-customers-header-left">
          <h2>Customers</h2>
          <span className="pos-customers-count">{customerStats.total} total</span>
        </div>
        <div className="pos-customers-header-right">
          <input
            type="text"
            className="pos-search-input"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: 200, marginBottom: 0 }}
          />
          <button className="pos-customers-add-btn" onClick={() => setShowAddForm(true)}>
            + Add Customer
          </button>
        </div>
      </div>

      {showAddForm && (
        <form className="pos-customers-add-form" onSubmit={handleAddCustomer}>
          <input
            type="text"
            placeholder="Customer name *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
            required
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={newPhone}
            onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            maxLength={10}
          />
          <button type="submit" className="btn-sm primary">Save</button>
          <button type="button" className="btn-sm" onClick={() => { setShowAddForm(false); setNewName(''); setNewPhone('') }}>Cancel</button>
        </form>
      )}

      <div className="pos-customers-content">
        <div className="pos-customers-list-section">
          {filteredCustomers.length === 0 ? (
            <div className="pos-empty">
              <IconUsers size={40} />
              <span>{searchQuery ? 'No customers found' : 'No customers yet'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {searchQuery ? 'Try a different search' : 'Add your first customer'}
              </span>
            </div>
          ) : (
            <div className="pos-customers-list">
              {filteredCustomers.map(customer => (
                <div
                  key={customer.id}
                  className={`pos-customer-card ${selectedCustomer?.id === customer.id ? 'selected' : ''}`}
                  onClick={() => handleViewOrders(customer)}
                >
                  <div className="pos-customer-avatar">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="pos-customer-info">
                    <span className="pos-customer-name">{customer.name}</span>
                    {customer.phone && (
                      <span className="pos-customer-phone">
                        <IconPhone size={10} /> {customer.phone}
                      </span>
                    )}
                  </div>
                  <div className="pos-customer-meta">
                    <span className="pos-customer-orders">{customer.orderCount || 0} orders</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedCustomer && (
          <div className="pos-customer-detail">
            <div className="pos-customer-detail-header">
              <h3>{selectedCustomer.name}</h3>
              {selectedCustomer.phone && <span>📞 {selectedCustomer.phone}</span>}
            </div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              Order History
            </h4>
            {ordersLoading ? (
              <div className="pos-loading" style={{ padding: '20px' }}>
                <div className="loading-spinner"></div>
                <p>Loading orders...</p>
              </div>
            ) : customerOrders.length === 0 ? (
              <div className="pos-empty" style={{ padding: '20px' }}>
                <IconClipboard size={24} />
                <span>No orders found</span>
              </div>
            ) : (
              <div className="pos-customer-orders-list">
                {customerOrders.slice(0, 20).map(order => (
                  <div key={order.id} className="pos-customer-order-row">
                    <div className="pos-customer-order-info">
                      <span className="pos-customer-order-code">#{order.order_code || order.id.slice(0, 6).toUpperCase()}</span>
                      <span className="pos-customer-order-date">{formatOrderDateTime(order.created_at)}</span>
                    </div>
                    <span className="pos-customer-order-total">{formatCurrency(order.total_price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}