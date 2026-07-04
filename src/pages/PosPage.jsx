import { useState, useCallback } from 'react'
import { IconBarChart, IconShoppingBag, IconUsers, IconClipboard, IconGrid, IconChefHat, IconDollarSign } from '../components/Icons'
import PosBilling from '../components/Pos/PosBilling'
import PosCounterOrders from '../components/Pos/PosCounterOrders'
import PosCustomers from '../components/Pos/PosCustomers'
import PosReports from '../components/Pos/PosReports'
import PosTableMap from '../components/Pos/PosTableMap'
import PosKitchen from '../components/Pos/PosKitchen'
import PosCashManagement from '../components/Pos/PosCashManagement'
import './PosPage.css'

const POS_TABS = [
  { id: 'table', label: 'Tables', icon: IconGrid },
  { id: 'billing', label: 'Billing', icon: IconShoppingBag },
  { id: 'orders', label: 'Counter Orders', icon: IconClipboard },
  { id: 'kitchen', label: 'Kitchen', icon: IconChefHat },
  { id: 'customers', label: 'Customers', icon: IconUsers },
  { id: 'reports', label: 'Reports', icon: IconBarChart },
  { id: 'cash', label: 'Cash', icon: IconDollarSign },
]

export default function PosPage({ restaurantId }) {
  const [activePosTab, setActivePosTab] = useState('table')
  const [selectedTable, setSelectedTable] = useState(null)

  const handleSelectTable = useCallback((table) => {
    setSelectedTable(table)
    setActivePosTab('billing')
  }, [])

  const handleClearTable = useCallback(() => {
    setSelectedTable(null)
  }, [])

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

      {activePosTab === 'table' && (
        <PosTableMap
          restaurantId={restaurantId}
          onSelectTable={handleSelectTable}
        />
      )}
      {activePosTab === 'billing' && (
        <PosBilling
          restaurantId={restaurantId}
          selectedTable={selectedTable}
          onClearTable={handleClearTable}
        />
      )}
      {activePosTab === 'orders' && <PosCounterOrders restaurantId={restaurantId} />}
      {activePosTab === 'kitchen' && <PosKitchen restaurantId={restaurantId} />}
      {activePosTab === 'customers' && <PosCustomers restaurantId={restaurantId} />}
      {activePosTab === 'reports' && <PosReports restaurantId={restaurantId} />}
      {activePosTab === 'cash' && <PosCashManagement restaurantId={restaurantId} />}
    </div>
  )
}
