import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { IconBarChart, IconShoppingBag, IconUsers, IconClipboard, IconTarget } from '../components/Icons'
import PosBilling from '../components/Pos/PosBilling'
import PosCounterOrders from '../components/Pos/PosCounterOrders'
import PosCustomers from '../components/Pos/PosCustomers'
import PosReports from '../components/Pos/PosReports'
import './PosPage.css'

const POS_TABS = [
  { id: 'billing', label: 'Billing', icon: IconShoppingBag },
  { id: 'orders', label: 'Counter Orders', icon: IconClipboard },
  { id: 'customers', label: 'Customers', icon: IconUsers },
  { id: 'reports', label: 'Reports', icon: IconBarChart },
]

export default function PosPage({ restaurantId }) {
  const [activePosTab, setActivePosTab] = useState('billing')

  return (
    <div className="pos-page">
      <div className="pos-subnav">
        {POS_TABS.map(tab => (
          <button
            key={tab.id}
            className={`pos-subnav-btn ${activePosTab === tab.id ? 'active' : ''}`}
            onClick={() => setActivePosTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activePosTab === 'billing' && <PosBilling restaurantId={restaurantId} />}
      {activePosTab === 'orders' && <PosCounterOrders restaurantId={restaurantId} />}
      {activePosTab === 'customers' && <PosCustomers restaurantId={restaurantId} />}
      {activePosTab === 'reports' && <PosReports restaurantId={restaurantId} />}
    </div>
  )
}
