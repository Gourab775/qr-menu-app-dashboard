import { IconUsers } from '../Icons'

export default function PosCustomers({ restaurantId }) {
  return (
    <div className="pos-customers-page">
      <div className="pos-customers-header">
        <h2>Customers</h2>
        <p>Customer profiles and loyalty features coming soon</p>
      </div>

      <div className="pos-empty" style={{ flex: 1 }}>
        <IconUsers size={48} style={{ opacity: 0.3 }} />
        <h3 style={{ fontSize: 16, color: 'var(--text)', marginTop: 8 }}>Customer Management</h3>
        <p style={{ maxWidth: 360, lineHeight: 1.6 }}>
          Track walk-in customers, view order history, and build loyalty programs.
          This feature will be available in a future update.
        </p>
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          textAlign: 'left',
        }}>
          <ul style={{ listStyle: 'disc', paddingLeft: 16, lineHeight: 1.8 }}>
            <li>Customer profiles with contact info</li>
            <li>Order history per customer</li>
            <li>Loyalty points and rewards</li>
            <li>Visit frequency analytics</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
