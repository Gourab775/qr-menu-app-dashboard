import { useRef, useEffect } from 'react'
import { formatDateTime } from '../utils/formatDateTime'

export default function BillModal({ order, isOpen, onClose }) {
  const printRef = useRef()

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen || !order) return null

  const GST_RATE = 0.05
  const subtotal = (order.items || []).reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 1), 
    0
  )
  const gstAmount = Math.round(subtotal * GST_RATE)
  const total = subtotal + gstAmount

  const handlePrint = () => {
    const printContent = printRef.current
    const WinPrint = window.open('', '', 'width=600,height=700')
    WinPrint.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${order.order_code || order.id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; padding: 20px; font-size: 14px; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #000; padding-bottom: 15px; }
            .header h1 { font-size: 20px; margin-bottom: 5px; }
            .header p { font-size: 12px; color: #666; }
            .info { margin: 15px 0; }
            .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .items { margin: 20px 0; border-top: 1px dashed #000; padding-top: 15px; }
            .item { display: flex; justify-content: space-between; margin: 8px 0; }
            .item-name { flex: 1; }
            .total { margin-top: 20px; border-top: 2px solid #000; padding-top: 10px; font-weight: bold; font-size: 18px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>{order.restaurants?.name || 'RESTAURANT'} BILL</h1>
            <p>Thank you for dining with us!</p>
          </div>
          
          <div class="info">
            <div class="info-row">
              <span>Order ID:</span>
              <span>${order.order_code || order.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div class="info-row">
              <span>Date:</span>
              <span>${formatDateTime(order.created_at)}</span>
            </div>
          </div>
          
          <div class="items">
            ${(order.items || []).map(item => `
              <div class="item">
                <span class="item-name">${item.name} × ${item.quantity}</span>
                <span>₹${(item.price || 0) * (item.quantity || 1)}</span>
              </div>
            `).join('')}
          </div>
          
          <div class="total">
            <div class="item">
              <span>Subtotal</span>
              <span>₹${subtotal}</span>
            </div>
            <div class="item">
              <span>GST (5%)</span>
              <span>₹${gstAmount}</span>
            </div>
            <div class="item" style="font-weight: bold; font-size: 16px; margin-top: 8px;">
              <span>TOTAL</span>
              <span>₹${total}</span>
            </div>
          </div>
          
          <div class="footer">
            <p>Please visit again!</p>
          </div>
        </body>
      </html>
    `)
    WinPrint.document.close()
    WinPrint.focus()
    setTimeout(() => {
      WinPrint.print()
      WinPrint.close()
    }, 250)
  }

  return (
    <div className="bill-modal-overlay" onClick={onClose}>
      <div className="bill-modal" onClick={e => e.stopPropagation()}>
        <div className="bill-modal-header">
          <h3>🧾 Generate Bill</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="bill-preview" ref={printRef}>
          <div className="bill-header">
            <h1>{order.restaurants?.name || 'RESTAURANT'}</h1>
            <p>Thank you for dining with us!</p>
          </div>

          <div className="bill-info">
            <div className="bill-row">
              <span>Order ID:</span>
              <strong>#{order.order_code || order.id.slice(0, 8).toUpperCase()}</strong>
            </div>
            <div className="bill-row">
              <span>Date:</span>
              <span>{formatDateTime(order.created_at)}</span>
            </div>
          </div>

          <div className="bill-items">
            <div className="bill-items-header">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
            </div>
            {(order.items || []).map((item, index) => (
              <div key={index} className="bill-item">
                <span>{item.name}</span>
                <span>×{item.quantity}</span>
                <span>₹{((item.price || 0) * (item.quantity || 1)).toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="bill-total">
            <div className="bill-subtotal">
              <span>Subtotal</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="bill-gst">
              <span>GST (5%)</span>
              <span>₹{gstAmount.toLocaleString()}</span>
            </div>
            <div className="bill-final-total">
              <span>Total</span>
              <span>₹{total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bill-actions">
          <button className="cancel-btn" onClick={onClose}>
            Close
          </button>
          <button className="print-btn" onClick={handlePrint}>
            🖨️ Print Bill
          </button>
        </div>
      </div>
    </div>
  )
}
