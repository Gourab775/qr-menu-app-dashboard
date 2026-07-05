import { useState, useMemo } from 'react'
import { IconCheck, IconSplit } from '../../components/Icons'
import { useFormatCurrency } from '../../hooks/useFormatCurrency'

const PAY_METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'upi', label: 'UPI', icon: '📱' },
  { id: 'card', label: 'Card', icon: '💳' },
]

export default function PosPaymentModal({ cartItems, serviceChargePct = 0, onClose, onComplete, processing }) {
  const formatCurrency = useFormatCurrency()
  const [method, setMethod] = useState('cash')
  const [amountTendered, setAmountTendered] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [error, setError] = useState(null)

  const { subtotal, itemDiscountTotal, billDiscountAmount, taxAmount, serviceChargeAmount, grandTotal } = useMemo(() => {
    const sub = cartItems.reduce((s, i) => s + i.price * i.quantity, 0)
    const itemDisc = cartItems.reduce((s, i) => s + i.price * i.quantity * (i.discount || 0) / 100, 0)
    const taxable = sub - itemDisc
    const tax = Math.round(taxable * 0.05)
    const sc = serviceChargePct > 0 ? Math.round(taxable * (serviceChargePct / 100)) : 0
    return {
      subtotal: sub,
      itemDiscountTotal: itemDisc,
      billDiscountAmount: 0,
      taxAmount: tax,
      serviceChargeAmount: sc,
      grandTotal: Math.max(0, taxable + tax + sc),
    }
  }, [cartItems, serviceChargePct])

  const tendered = Number(amountTendered) || 0
  const change = method === 'cash' ? Math.max(0, tendered - grandTotal) : 0
  const canConfirm = grandTotal > 0 && (method !== 'cash' || tendered >= grandTotal)

  const quickAmounts = useMemo(() => {
    const amounts = [grandTotal]
    const roundedUp = Math.ceil(grandTotal / 100) * 100
    if (roundedUp > grandTotal) amounts.push(roundedUp)
    amounts.push(grandTotal + 100)
    amounts.push(grandTotal + 500)
    return amounts
  }, [grandTotal])

  const handleConfirm = async () => {
    if (!canConfirm || processing) return
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
        serviceChargeRate: serviceChargePct,
        serviceChargeAmount,
        amountTendered: method === 'cash' ? tendered : grandTotal,
        change,
        customerName: customerName.trim() || 'Walk-in',
      })
    } catch (err) {
      setError(err.message || 'Payment failed')
    }
  }

  return (
    <div className="pos-payment-overlay" onClick={onClose}>
      <div className="pos-payment-modal" onClick={e => e.stopPropagation()}>
        <h2>Complete Payment</h2>
        <p className="pos-pay-subtitle">Select payment method and confirm</p>

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

        <div className="pos-pay-total">
          <span className="label">Grand Total</span>
          <span className="amount">{formatCurrency(grandTotal)}</span>
        </div>

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
            <div className="pos-pay-quick-btns">
              {quickAmounts.map(amt => (
                <button
                  key={amt}
                  className={`pos-pay-quick-btn ${tendered === amt ? 'selected' : ''}`}
                  onClick={() => setAmountTendered(String(amt))}
                >
                  {formatCurrency(amt)}
                </button>
              ))}
            </div>
          </div>
        )}

        {method === 'cash' && change > 0 && (
          <div className="pos-pay-change">
            <span className="label">Change Due</span>
            <span className="amount">{formatCurrency(change)}</span>
          </div>
        )}

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

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}

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