import { useState, useMemo } from 'react'
import { IconCheck } from '../../components/Icons'

function formatCurrency(v) {
  return '\u20B9' + (Math.round(v) || 0).toLocaleString('en-IN')
}

const PAY_METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'upi', label: 'UPI', icon: '📱' },
  { id: 'card', label: 'Card', icon: '💳' },
]

export default function PosPaymentModal({ cartItems, onClose, onComplete }) {
  const [method, setMethod] = useState('cash')
  const [amountTendered, setAmountTendered] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  const { subtotal, itemDiscountTotal, billDiscountAmount, taxAmount, grandTotal } = useMemo(() => {
    const sub = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)
    const itemDisc = cartItems.reduce((s, i) => s + i.price * i.quantity * (i.discount || 0) / 100, 0)
    const taxable = sub - itemDisc
    const tax = Math.round(taxable * 0.05)
    return {
      subtotal: sub,
      itemDiscountTotal: itemDisc,
      billDiscountAmount: 0,
      taxAmount: tax,
      grandTotal: Math.max(0, taxable + tax),
    }
  }, [cartItems])

  const tendered = Number(amountTendered) || 0
  const change = method === 'cash' ? Math.max(0, tendered - grandTotal) : 0
  const canConfirm = grandTotal > 0 && (method !== 'cash' || tendered >= grandTotal)

  const handleConfirm = async () => {
    if (!canConfirm || processing) return
    setProcessing(true)
    setError(null)
    try {
      await onComplete({
        method,
        grandTotal,
        subtotal,
        discountType: 'flat',
        discountValue: 0,
        discountAmount: 0,
        itemDiscountTotal,
        taxRate: 5,
        taxAmount,
        amountTendered: method === 'cash' ? tendered : grandTotal,
        change,
        customerName: customerName.trim() || 'Walk-in',
      })
    } catch (err) {
      setError(err.message || 'Payment failed')
      setProcessing(false)
    }
  }

  return (
    <div className="pos-payment-overlay" onClick={onClose}>
      <div className="pos-payment-modal" onClick={e => e.stopPropagation()}>
        <h2>Complete Payment</h2>
        <p className="pos-pay-subtitle">Select payment method and confirm</p>

        {/* Payment Methods */}
        <div className="pos-pay-methods">
          {PAY_METHODS.map(pm => (
            <button
              key={pm.id}
              className={`pos-pay-method ${method === pm.id ? 'selected' : ''}`}
              onClick={() => setMethod(pm.id)}
            >
              <span style={{ fontSize: 24 }}>{pm.icon}</span>
              <span>{pm.label}</span>
            </button>
          ))}
        </div>

        {/* Total */}
        <div className="pos-pay-total">
          <span className="label">Grand Total</span>
          <span className="amount">{formatCurrency(grandTotal)}</span>
        </div>

        {/* Cash Tendered */}
        {method === 'cash' && (
          <div className="pos-pay-tendered">
            <label>Amount Tendered</label>
            <input
              type="number"
              placeholder="Enter amount"
              value={amountTendered}
              onChange={e => setAmountTendered(e.target.value)}
              autoFocus
              min="0"
            />
          </div>
        )}

        {/* Change */}
        {method === 'cash' && change > 0 && (
          <div className="pos-pay-change">
            <span className="label">Change Due</span>
            <span className="amount">{formatCurrency(change)}</span>
          </div>
        )}

        {/* Customer Name (optional) */}
        <div className="pos-pay-tendered" style={{ marginBottom: 16 }}>
          <label>Customer Name (optional)</label>
          <input
            type="text"
            placeholder="Walk-in"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            style={{ fontSize: 14, fontWeight: 500 }}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="pos-pay-actions">
          <button className="cancel" onClick={onClose} disabled={processing}>
            Cancel
          </button>
          <button
            className="confirm"
            onClick={handleConfirm}
            disabled={!canConfirm || processing}
          >
            {processing ? 'Processing...' : `Confirm ${formatCurrency(grandTotal)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
