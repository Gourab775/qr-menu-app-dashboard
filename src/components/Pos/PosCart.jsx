import { useState, useMemo } from 'react'
import { IconX, IconShoppingBag, IconPrinter } from '../../components/Icons'

function formatCurrency(v) {
  return '\u20B9' + (Math.round(v) || 0).toLocaleString('en-IN')
}

export default function PosCart({
  items,
  onUpdateQty,
  onRemoveItem,
  onUpdateNotes,
  onUpdateItemDiscount,
  onHoldBill,
  onPayment,
  onGenerateKOT,
  kotGenerating,
  currentOrderId,
  billType,
  tokenNumber,
  serviceChargePct,
}) {
  const [billDiscount, setBillDiscount] = useState('')
  const [discountType, setDiscountType] = useState('flat')

  const { subtotal, itemDiscountTotal, billDiscountAmount, taxableAmount, taxRate, taxAmount, serviceChargeAmount, grandTotal } = useMemo(() => {
    const sub = items.reduce((s, i) => s + i.price * i.quantity, 0)
    const itemDisc = items.reduce((s, i) => s + (i.price * i.quantity * (i.discount || 0) / 100), 0)
    const billDisc = !billDiscount ? 0 : discountType === 'percentage'
      ? sub * (Math.min(100, Math.max(0, Number(billDiscount))) / 100)
      : Math.min(sub, Math.max(0, Number(billDiscount) || 0))
    const taxable = sub - itemDisc - billDisc
    const tax = items.length > 0 ? Math.round(taxable * 0.05) : 0
    const sc = items.length > 0 && serviceChargePct > 0 ? Math.round(taxable * (serviceChargePct / 100)) : 0
    const total = Math.max(0, taxable + tax + sc)
    return {
      subtotal: sub,
      itemDiscountTotal: itemDisc,
      billDiscountAmount: billDisc,
      taxableAmount: taxable,
      taxRate: 5,
      taxAmount: tax,
      serviceChargeAmount: sc,
      grandTotal: total,
    }
  }, [items, billDiscount, discountType, serviceChargePct])

  return (
    <div className="pos-cart-panel">
      <div className="pos-cart-header">
        <h3>Current Bill</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tokenNumber && <span className="pos-cart-count">#{tokenNumber}</span>}
          <span className="pos-cart-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="pos-cart-empty">
          <IconShoppingBag size={40} />
          <span>No items added</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select items from the menu</span>
        </div>
      ) : (
        <>
          <div className="pos-cart-items">
            {items.map((item, idx) => (
              <div key={item.menu_item_id + '-' + idx} className="pos-cart-item">
                <div className="pos-cart-item-row">
                  <button
                    className="pos-cart-qty-btn minus"
                    onClick={() => onUpdateQty(item.menu_item_id, -1)}
                  >−</button>
                  <span className="pos-cart-qty-value">{item.quantity}</span>
                  <button
                    className="pos-cart-qty-btn plus"
                    onClick={() => onUpdateQty(item.menu_item_id, 1)}
                  >+</button>
                  <span className="pos-cart-item-name">{item.name}</span>
                  <span className="pos-cart-item-price">
                    {formatCurrency(item.price * item.quantity * (1 - (item.discount || 0) / 100))}
                  </span>
                  <button
                    className="pos-cart-item-remove"
                    onClick={() => onRemoveItem(item.menu_item_id)}
                  >
                    <IconX size={14} />
                  </button>
                </div>
                <div className="pos-cart-item-notes">
                  <input
                    placeholder="Add note..."
                    value={item.notes}
                    onChange={e => onUpdateNotes(item.menu_item_id, e.target.value)}
                  />
                  <input
                    type="number"
                    className="pos-cart-item-disc"
                    placeholder="Disc%"
                    value={item.discount || ''}
                    onChange={e => onUpdateItemDiscount(item.menu_item_id, e.target.value)}
                    min="0"
                    max="100"
                    style={{ width: 50 }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pos-cart-totals">
            <div className="pos-total-row">
              <span className="pos-total-label">Subtotal</span>
              <span className="pos-total-value">{formatCurrency(subtotal)}</span>
            </div>

            <div className="pos-total-row pos-discount-row">
              <span className="pos-total-label">Bill Discount</span>
              <input
                type="number"
                className="pos-discount-input"
                placeholder="0"
                value={billDiscount}
                onChange={e => setBillDiscount(e.target.value)}
                min="0"
              />
              <select
                className="pos-discount-type"
                value={discountType}
                onChange={e => setDiscountType(e.target.value)}
              >
                <option value="flat">Flat</option>
                <option value="percentage">%</option>
              </select>
            </div>

            {billDiscountAmount > 0 && (
              <div className="pos-total-row">
                <span className="pos-total-label">Discount</span>
                <span className="pos-total-value" style={{ color: 'var(--green)' }}>-{formatCurrency(billDiscountAmount)}</span>
              </div>
            )}

            <div className="pos-total-row">
              <span className="pos-total-label">Tax (5%)</span>
              <span className="pos-total-value">{formatCurrency(taxAmount)}</span>
            </div>

            {serviceChargeAmount > 0 && (
              <div className="pos-total-row">
                <span className="pos-total-label">Service Charge ({serviceChargePct}%)</span>
                <span className="pos-total-value">{formatCurrency(serviceChargeAmount)}</span>
              </div>
            )}

            <div className="pos-total-row grand">
              <span className="pos-total-label">Grand Total</span>
              <span className="pos-total-value">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <div className="pos-cart-actions">
            {!currentOrderId && (
              <button
                className="pos-cart-action-btn kot"
                onClick={onGenerateKOT}
                disabled={items.length === 0 || kotGenerating}
              >
                <IconPrinter size={14} /> {kotGenerating ? 'Generating...' : 'KOT'}
              </button>
            )}
            <button className="pos-cart-action-btn hold" onClick={onHoldBill}>
              Hold
            </button>
            <button
              className="pos-cart-action-btn pay"
              onClick={onPayment}
              disabled={grandTotal <= 0}
            >
              Pay {formatCurrency(grandTotal)}
            </button>
          </div>
        </>
      )}
    </div>
  )
}