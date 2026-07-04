import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconSearch, IconShoppingBag, IconX, IconPrinter, IconCheck } from '../../components/Icons'
import PosCart from './PosCart'
import PosPaymentModal from './PosPaymentModal'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (v || 0).toLocaleString('en-IN')
}

export default function PosBilling({ restaurantId, selectedTable, onClearTable }) {
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cartItems, setCartItems] = useState([])
  const [showPayment, setShowPayment] = useState(false)
  const [heldBills, setHeldBills] = useState([])
  const [resumeBill, setResumeBill] = useState(null)
  const [billType, setBillType] = useState('dine_in')
  const [serviceChargePct, setServiceChargePct] = useState(0)
  const [kotOrders, setKotOrders] = useState([])
  const [tokenNumber, setTokenNumber] = useState(null)
  const [currentOrderId, setCurrentOrderId] = useState(null)
  const [kotGenerating, setKotGenerating] = useState(false)
  const [submittingPayment, setSubmittingPayment] = useState(false)

  const mountedRef = useRef(false)
  const HELD_BILLS_KEY = `pos_held_bills_${restaurantId}`

  useEffect(() => {
    mountedRef.current = true
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [catResult, menuResult] = await Promise.all([
          fetchWithTimeout(
            supabase.from('categories').select('id, name, sort_order').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
            API_TIMEOUT
          ),
          fetchWithTimeout(
            supabase.from('menu_items').select('id, name, price, is_veg, is_available, category_id').eq('restaurant_id', restaurantId).order('name', { ascending: true }),
            API_TIMEOUT
          )
        ])
        if (!mountedRef.current) return
        if (catResult.error) throw new Error(catResult.error.message)
        if (menuResult.error) throw new Error(menuResult.error.message)
        setCategories(catResult.data || [])
        setMenuItems(menuResult.data || [])
      } catch (err) {
        if (mountedRef.current) setError(err.message || 'Failed to load menu')
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    loadData()
    loadHeldBills()
    return () => { mountedRef.current = false }
  }, [restaurantId])

  useEffect(() => {
    if (selectedTable) {
      setBillType('dine_in')
    }
  }, [selectedTable])

  const loadHeldBills = () => {
    try {
      const stored = localStorage.getItem(HELD_BILLS_KEY)
      if (stored) setHeldBills(JSON.parse(stored))
    } catch {}
  }

  const saveHeldBills = (bills) => {
    try {
      localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(bills))
      setHeldBills(bills)
    } catch {}
  }

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      if (activeCategory !== 'all' && item.category_id !== activeCategory) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!item.name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [menuItems, activeCategory, searchQuery])

  const handleAddItem = (item) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.menu_item_id === item.id)
      if (existing) {
        return prev.map(i =>
          i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, {
        menu_item_id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        notes: '',
        discount: 0,
      }]
    })
  }

  const handleUpdateQty = (itemId, delta) => {
    setCartItems(prev => {
      const updated = prev.map(i => {
        if (i.menu_item_id !== itemId) return i
        const newQty = i.quantity + delta
        if (newQty <= 0) return null
        return { ...i, quantity: newQty }
      }).filter(Boolean)
      return updated
    })
  }

  const handleRemoveItem = (itemId) => {
    setCartItems(prev => prev.filter(i => i.menu_item_id !== itemId))
  }

  const handleUpdateNotes = (itemId, notes) => {
    setCartItems(prev => prev.map(i =>
      i.menu_item_id === itemId ? { ...i, notes } : i
    ))
  }

  const handleUpdateItemDiscount = (itemId, discount) => {
    const val = Math.max(0, Math.min(100, Number(discount) || 0))
    setCartItems(prev => prev.map(i =>
      i.menu_item_id === itemId ? { ...i, discount: val } : i
    ))
  }

  const handleHoldBill = () => {
    if (cartItems.length === 0) return
    const held = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      items: [...cartItems],
      billType,
      tokenNumber,
      createdAt: new Date().toISOString(),
    }
    const updated = [...heldBills, held]
    saveHeldBills(updated)
    setCartItems([])
    setCurrentOrderId(null)
    setTokenNumber(null)
  }

  const handleResumeBill = (held) => {
    setCartItems(held.items)
    setBillType(held.billType || 'dine_in')
    setTokenNumber(held.tokenNumber || null)
    setResumeBill(null)
    const updated = heldBills.filter(b => b.id !== held.id)
    saveHeldBills(updated)
  }

  const generateTokenNumber = () => {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const token = dateStr + Math.floor(1000 + Math.random() * 9000)
    return token
  }

  const handleGenerateKOT = async () => {
    if (cartItems.length === 0) return
    setKotGenerating(true)
    const token = tokenNumber || generateTokenNumber()
    setTokenNumber(token)

    try {
      const lineItems = cartItems.map(i => ({
        menu_item_id: i.menu_item_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        notes: i.notes || '',
        item_discount: i.discount || 0,
        total: i.price * i.quantity * (1 - (i.discount || 0) / 100),
      }))

      const tableLabel = selectedTable ? `T${selectedTable.table_number}` : ''
      const kotNote = tableLabel
        ? (billType === 'dine_in' ? `Table ${tableLabel}` : billType === 'takeaway' ? `Takeaway ${token}` : `Delivery ${token}`)
        : (billType === 'takeaway' ? `Takeaway ${token}` : `Delivery ${token}`)

      const orderData = {
        restaurant_id: restaurantId,
        items: [...lineItems, { _pos_meta: true, bill_type: billType, token_number: token, kot_status: 'kot_generated' }],
        total_price: Math.round(lineItems.reduce((s, i) => s + i.total, 0)),
        status: 'kot_generated',
        order_type: 'pos',
        note: kotNote,
      }

      const { data, error: insertError } = await fetchWithTimeout(
        supabase.from('live_orders').insert(orderData).select('id').single(),
        API_TIMEOUT
      )

      if (insertError) throw insertError

      setCurrentOrderId(data.id)
      setCartItems([])
    } catch (err) {
      console.error('[POS] Failed to generate KOT:', err)
      alert('Failed to generate KOT. Please try again.')
    } finally {
      setKotGenerating(false)
    }
  }

  const handlePaymentComplete = async (paymentData) => {
    setSubmittingPayment(true)
    try {
      const lineItems = cartItems.map(i => ({
        menu_item_id: i.menu_item_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        notes: i.notes || '',
        item_discount: i.discount || 0,
        total: i.price * i.quantity * (1 - (i.discount || 0) / 100),
      }))

      const subtotal = lineItems.reduce((s, i) => s + i.price * i.quantity, 0)
      const itemDiscountTotal = subtotal - lineItems.reduce((s, i) => s + i.total, 0)
      const billDiscountAmount = paymentData.discountAmount || 0
      const taxableAmount = subtotal - itemDiscountTotal - billDiscountAmount
      const taxAmount = paymentData.taxAmount || 0
      const serviceChargeAmount = paymentData.serviceChargeAmount || 0
      const grandTotal = paymentData.grandTotal

      const tableLabel = selectedTable ? `T${selectedTable.table_number}` : ''
      const metaNote = tableLabel
        ? `Table ${tableLabel} · POS ${paymentData.method.toUpperCase()} ${formatCurrency(grandTotal)}`
        : `POS ${paymentData.method.toUpperCase()} ${formatCurrency(grandTotal)}`

      const orderData = {
        restaurant_id: restaurantId,
        items: [
          ...lineItems,
          {
            _pos_meta: true,
            subtotal,
            item_discount_total: itemDiscountTotal,
            discount_type: paymentData.discountType || 'flat',
            discount_value: paymentData.discountValue || 0,
            discount_amount: billDiscountAmount,
            tax_rate: paymentData.taxRate || 0,
            tax_amount: taxAmount,
            service_charge_rate: paymentData.serviceChargeRate || 0,
            service_charge_amount: serviceChargeAmount,
            net_total: grandTotal,
            payment_method: paymentData.method,
            payment_amount: paymentData.amountTendered || grandTotal,
            change: paymentData.change || 0,
            customer_name: paymentData.customerName || 'Walk-in',
            bill_type: billType,
            token_number: tokenNumber || '',
            table_number: selectedTable?.table_number || '',
          }
        ],
        total_price: Math.round(grandTotal),
        status: 'completed',
        order_type: 'pos',
        note: metaNote,
      }

      const { error: insertError } = await fetchWithTimeout(
        supabase.from('live_orders').insert(orderData).select('id').single(),
        API_TIMEOUT
      )

      if (insertError) throw insertError

      if (selectedTable) {
        try {
          const statusesKey = `pos_table_statuses_${restaurantId}`
          const stored = JSON.parse(localStorage.getItem(statusesKey) || '{}')
          stored[selectedTable.id] = { status: 'paid', updatedAt: new Date().toISOString() }
          localStorage.setItem(statusesKey, JSON.stringify(stored))
        } catch {}
      }

      setCartItems([])
      setShowPayment(false)
      setCurrentOrderId(null)
      setTokenNumber(null)
      if (onClearTable) onClearTable()
    } catch (err) {
      console.error('[POS] Failed to save bill:', err)
      throw err
    } finally {
      setSubmittingPayment(false)
    }
  }

  if (loading) {
    return (
      <div className="pos-billing">
        <div className="pos-menu-panel">
          <div className="pos-loading">
            <div className="loading-spinner"></div>
            <p>Loading menu...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pos-billing">
        <div className="pos-menu-panel">
          <div className="pos-empty">
            <p>Failed to load menu</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-billing">
      <div className="pos-menu-panel">
        {selectedTable && (
          <div className="pos-billing-table-bar">
            <span>Table <strong>T{selectedTable.table_number}</strong></span>
            <button onClick={onClearTable}><IconX size={14} /> Change</button>
          </div>
        )}

        {resumeBill && (
          <div className="pos-held-bar">
            <span>Resume bill from {new Date(resumeBill.createdAt).toLocaleString('en-IN')}</span>
            <button onClick={() => handleResumeBill(resumeBill)}>Resume</button>
            <button onClick={() => setResumeBill(null)}>Dismiss</button>
          </div>
        )}

        {heldBills.length > 0 && !resumeBill && (
          <div className="pos-held-bar">
            <span>{heldBills.length} held bill{heldBills.length > 1 ? 's' : ''}</span>
            <button onClick={() => setResumeBill(heldBills[heldBills.length - 1])}>Resume Latest</button>
          </div>
        )}

        <div className="pos-billing-options">
          <div className="pos-bill-type-select">
            {['dine_in', 'takeaway', 'delivery'].map(type => (
              <button
                key={type}
                className={`pos-bill-type-btn ${billType === type ? 'active' : ''}`}
                onClick={() => setBillType(type)}
              >
                {type === 'dine_in' ? '🍽️' : type === 'takeaway' ? '🛍️' : '🚚'} {type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
          <div className="pos-service-charge">
            <label>SC</label>
            <select value={serviceChargePct} onChange={e => setServiceChargePct(Number(e.target.value))}>
              <option value={0}>0%</option>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={15}>15%</option>
            </select>
          </div>
        </div>

        <div className="pos-category-bar">
          <button
            className={`pos-category-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`pos-category-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >{cat.name}</button>
          ))}
        </div>

        <div className="pos-search-bar">
          <input
            type="text"
            className="pos-search-input"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="pos-menu-grid">
          {filteredItems.length === 0 ? (
            <div className="pos-menu-empty">
              <IconSearch size={32} />
              <span>No items found</span>
            </div>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                className="pos-menu-item"
                onClick={() => handleAddItem(item)}
                disabled={!item.is_available}
              >
                <div className={`item-veg ${item.is_veg ? 'veg' : 'nonveg'}`} />
                <span className="item-name">{item.name}</span>
                <span className="item-price">{formatCurrency(item.price)}</span>
                {!item.is_available && <span className="item-unavailable">Unavailable</span>}
              </button>
            ))
          )}
        </div>
      </div>

      <PosCart
        items={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onUpdateNotes={handleUpdateNotes}
        onUpdateItemDiscount={handleUpdateItemDiscount}
        onHoldBill={handleHoldBill}
        onPayment={() => setShowPayment(true)}
        onGenerateKOT={handleGenerateKOT}
        kotGenerating={kotGenerating}
        currentOrderId={currentOrderId}
        billType={billType}
        tokenNumber={tokenNumber}
        serviceChargePct={serviceChargePct}
      />

      {showPayment && (
        <PosPaymentModal
          cartItems={cartItems}
          serviceChargePct={serviceChargePct}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
          processing={submittingPayment}
        />
      )}
    </div>
  )
}