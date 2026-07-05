import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconSearch, IconPlus, IconTable, IconSplit, IconMove, IconLayers } from '../Icons'
import { useFormatCurrency } from '../../hooks/useFormatCurrency'

const API_TIMEOUT = 30000

const STATUS_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  running_order: 'Running Order',
  kot_printed: 'KOT Printed',
  paid: 'Paid',
  reserved: 'Reserved',
}

const STATUS_CLASSES = {
  available: 'table-status-available',
  occupied: 'table-status-occupied',
  running_order: 'table-status-running',
  kot_printed: 'table-status-kot',
  paid: 'table-status-paid',
  reserved: 'table-status-reserved',
}

export default function PosTableMap({ restaurantId, onSelectTable }) {
  const formatCurrency = useFormatCurrency()
  const [tables, setTables] = useState([])
  const [tableStatuses, setTableStatuses] = useState({})
  const [sections] = useState(() => {
    try {
      const saved = localStorage.getItem(`pos_sections_${restaurantId}`)
      return saved ? JSON.parse(saved) : ['AC', 'Non AC', 'Garden', 'Rooftop', 'VIP']
    } catch { return ['AC', 'Non AC', 'Garden', 'Rooftop', 'VIP'] }
  })
  const [tableSections, setTableSections] = useState(() => {
    try {
      const saved = localStorage.getItem(`pos_table_sections_${restaurantId}`)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [activeSection, setActiveSection] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddTable, setShowAddTable] = useState(false)
  const [newTableNum, setNewTableNum] = useState('')
  const [newTableSection, setNewTableSection] = useState(sections[0] || 'AC')
  const [showMoveTable, setShowMoveTable] = useState(null)
  const [moveTargetSection, setMoveTargetSection] = useState(sections[0] || 'AC')
  const [adding, setAdding] = useState(false)

  const mountedRef = useRef(false)

  const STATUSES_KEY = `pos_table_statuses_${restaurantId}`

  useEffect(() => {
    mountedRef.current = true
    loadTables()
    loadStatuses()
    return () => { mountedRef.current = false }
  }, [restaurantId])

  const loadStatuses = () => {
    try {
      const stored = localStorage.getItem(STATUSES_KEY)
      if (stored) setTableStatuses(JSON.parse(stored))
    } catch {}
  }

  const saveStatuses = (statuses) => {
    try {
      localStorage.setItem(STATUSES_KEY, JSON.stringify(statuses))
      setTableStatuses(statuses)
    } catch {}
  }

  const loadTables = async () => {
    setLoading(true)
    try {
      const { data, error } = await fetchWithTimeout(
        supabase
          .from('restaurant_tables')
          .select('id, table_number, is_active')
          .eq('restaurant_id', restaurantId)
          .order('table_number', { ascending: true }),
        API_TIMEOUT
      )
      if (!mountedRef.current) return
      if (error) throw error
      const sorted = (data || []).sort((a, b) => {
        const numA = Number(a.table_number) || 0
        const numB = Number(b.table_number) || 0
        return numA - numB
      })
      setTables(sorted)
    } catch (err) {
      console.error('Failed to load tables:', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const handleAddTable = async (e) => {
    e.preventDefault()
    if (!newTableNum.trim()) return
    setAdding(true)
    try {
      const newId = crypto.randomUUID()
      const token = crypto.randomUUID()
      const { error } = await supabase
        .from('restaurant_tables')
        .insert({
          id: newId,
          restaurant_id: restaurantId,
          table_number: newTableNum.trim(),
          is_active: true,
          table_token: token,
        })
      if (error) throw error

      const updatedSections = { ...tableSections, [newId]: newTableSection }
      try { localStorage.setItem(`pos_table_sections_${restaurantId}`, JSON.stringify(updatedSections)) } catch {}
      setTableSections(updatedSections)

      setNewTableNum('')
      setShowAddTable(false)
      loadTables()
    } catch (err) {
      console.error('Failed to add table:', err)
    } finally {
      setAdding(false)
    }
  }

  const updateTableStatus = (tableId, status) => {
    const updated = {
      ...tableStatuses,
      [tableId]: { status, updatedAt: new Date().toISOString() }
    }
    saveStatuses(updated)
  }

  const handleMoveTable = () => {
    if (!showMoveTable) return
    const updated = { ...tableSections, [showMoveTable]: moveTargetSection }
    try { localStorage.setItem(`pos_table_sections_${restaurantId}`, JSON.stringify(updated)) } catch {}
    setTableSections(updated)
    setShowMoveTable(null)
  }

  const handleQuickStatus = (tableId, status) => {
    updateTableStatus(tableId, status)
  }

  const getTableStatus = (tableId) => {
    return tableStatuses[tableId]?.status || 'available'
  }

  const filteredTables = useMemo(() => {
    return tables.filter(table => {
      if (!table.is_active) return false
      if (activeSection !== 'all') {
        const section = tableSections[table.id] || 'General'
        if (section !== activeSection) return false
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!String(table.table_number).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [tables, activeSection, searchQuery, tableSections])

  const groupedTables = useMemo(() => {
    if (activeSection !== 'all') return { [activeSection]: filteredTables }
    const groups = {}
    sections.forEach(s => { groups[s] = [] })
    groups['General'] = []
    filteredTables.forEach(table => {
      const section = tableSections[table.id] || 'General'
      if (!groups[section]) groups[section] = []
      groups[section].push(table)
    })
    Object.keys(groups).forEach(k => {
      if (groups[k].length === 0) delete groups[k]
    })
    return groups
  }, [filteredTables, sections, activeSection, tableSections])

  const sectionColor = (section) => {
    const colors = {
      'AC': 'var(--blue)',
      'Non AC': 'var(--green)',
      'Garden': 'var(--green)',
      'Rooftop': 'var(--orange)',
      'VIP': 'var(--purple)',
      'General': 'var(--text-muted)',
    }
    return colors[section] || 'var(--text-muted)'
  }

  const statusCounts = useMemo(() => {
    const counts = {}
    tables.forEach(t => {
      if (!t.is_active) return
      const s = getTableStatus(t.id)
      counts[s] = (counts[s] || 0) + 1
    })
    return counts
  }, [tables, tableStatuses])

  if (loading) {
    return (
      <div className="pos-table-page">
        <div className="pos-loading">
          <div className="loading-spinner"></div>
          <p>Loading tables...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-table-page">
      <div className="pos-table-header">
        <div className="pos-table-header-left">
          <h2>Table Layout</h2>
          <div className="pos-table-legend">
            <span className="legend-dot available" /> Available
            <span className="legend-dot occupied" /> Occupied
            <span className="legend-dot running" /> Running
            <span className="legend-dot kot" /> KOT
            <span className="legend-dot paid" /> Paid
            <span className="legend-dot reserved" /> Reserved
          </div>
        </div>
        <div className="pos-table-header-right">
          <input
            type="text"
            className="pos-search-input"
            placeholder="Search table..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: 160, marginBottom: 0 }}
          />
          <button className="pos-table-add-btn" onClick={() => setShowAddTable(true)}>
            <IconPlus size={14} /> Add Table
          </button>
        </div>
      </div>

      <div className="pos-table-stats-row">
        <div className="stat-chip available">{statusCounts.available || 0} Available</div>
        <div className="stat-chip occupied">{statusCounts.occupied || 0} Occupied</div>
        <div className="stat-chip running">{statusCounts.running_order || 0} Running</div>
        <div className="stat-chip kot">{statusCounts.kot_printed || 0} KOT</div>
        <div className="stat-chip paid">{statusCounts.paid || 0} Paid</div>
        <div className="stat-chip reserved">{statusCounts.reserved || 0} Reserved</div>
      </div>

      <div className="pos-section-bar">
        <button
          className={`pos-section-btn ${activeSection === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSection('all')}
        >All</button>
        {sections.map(s => (
          <button
            key={s}
            className={`pos-section-btn ${activeSection === s ? 'active' : ''}`}
            onClick={() => setActiveSection(s)}
            style={activeSection === s ? { borderColor: sectionColor(s), background: `${sectionColor(s)}15` } : {}}
          >{s}</button>
        ))}
      </div>

      {showAddTable && (
        <form className="pos-table-add-form" onSubmit={handleAddTable}>
          <input
            type="text"
            placeholder="Table number (e.g. 5, T1)"
            value={newTableNum}
            onChange={e => setNewTableNum(e.target.value)}
            autoFocus
            required
          />
          <select value={newTableSection} onChange={e => setNewTableSection(e.target.value)}>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="btn-sm primary" disabled={adding}>
            {adding ? 'Adding...' : 'Add'}
          </button>
          <button type="button" className="btn-sm" onClick={() => { setShowAddTable(false); setNewTableNum('') }}>
            Cancel
          </button>
        </form>
      )}

      {tables.length === 0 ? (
        <div className="pos-empty">
          <IconTable size={48} />
          <span>No tables found</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Add a table to start</span>
        </div>
      ) : Object.keys(groupedTables).length === 0 ? (
        <div className="pos-empty">
          <IconSearch size={40} />
          <span>No tables match your search</span>
        </div>
      ) : (
        <div className="pos-table-floor">
          {Object.entries(groupedTables).map(([section, sectionTables]) => (
            <div key={section} className="pos-table-section">
              <div className="pos-table-section-header" style={{ color: sectionColor(section) }}>
                <span className="pos-table-section-name">{section}</span>
                <span className="pos-table-section-count">{sectionTables.length} tables</span>
              </div>
              <div className="pos-table-grid">
                {sectionTables.map(table => {
                  const status = getTableStatus(table.id)
                  return (
                    <div
                      key={table.id}
                      className={`pos-table-card ${STATUS_CLASSES[status] || ''}`}
                      onClick={() => onSelectTable(table)}
                    >
                      <span className="pos-table-card-num">T{table.table_number}</span>
                      <span className="pos-table-card-status">{STATUS_LABELS[status] || 'Available'}</span>
                      <div className="pos-table-card-actions" onClick={e => e.stopPropagation()}>
                        <button
                          className="pos-table-qaction available"
                          title="Mark Available"
                          onClick={() => handleQuickStatus(table.id, 'available')}
                        />
                        <button
                          className="pos-table-qaction occupied"
                          title="Mark Occupied"
                          onClick={() => handleQuickStatus(table.id, 'occupied')}
                        />
                        <button
                          className="pos-table-qaction reserved"
                          title="Mark Reserved"
                          onClick={() => handleQuickStatus(table.id, 'reserved')}
                        />
                      </div>
                      <div className="pos-table-card-tools">
                        <button
                          className="pos-table-tool-btn"
                          title="Move to section"
                          onClick={e => { e.stopPropagation(); setShowMoveTable(table.id); setMoveTargetSection(tableSections[table.id] || 'General') }}
                        ><IconMove size={12} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showMoveTable && (
        <div className="pos-table-modal-overlay" onClick={() => setShowMoveTable(null)}>
          <div className="pos-table-modal" onClick={e => e.stopPropagation()}>
            <h3>Move Table</h3>
            <p>Select target section</p>
            <select value={moveTargetSection} onChange={e => setMoveTargetSection(e.target.value)}>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="pos-table-modal-actions">
              <button className="btn-sm primary" onClick={handleMoveTable}>Move</button>
              <button className="btn-sm" onClick={() => setShowMoveTable(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}