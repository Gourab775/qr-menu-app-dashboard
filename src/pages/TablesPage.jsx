import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithTimeout } from '../lib/apiUtils';
import './TablesPage.css';

const API_TIMEOUT = 15000;

export default function TablesPage({ restaurantId, restaurantSlug }) {
  const BASE_URL = `${window.location.origin.replace('5175', '5173')}/${restaurantSlug || 'default'}`;
  const FINAL_BASE_URL = window.location.origin.includes('localhost')
    ? BASE_URL
    : `https://qr-menu-app-gamma.vercel.app/${restaurantSlug || 'default'}`;

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const mountedRef = useRef(false);
  const abortControllerRef = useRef(null);

  const loadTables = useCallback(async (signal = null) => {
    if (!signal && mountedRef.current) setLoading(true);
    setError(null);

    try {
      const tablesPromise = supabase
        .from('restaurant_tables')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('table_number', { ascending: true });

      const { data, error: err } = await fetchWithTimeout(tablesPromise, API_TIMEOUT);

      if (signal?.aborted) return;

      if (err) throw err;

      const missingTokens = (data || []).filter(t => !t.table_token);
      if (missingTokens.length > 0) {
        for (const table of missingTokens) {
          const token = crypto.randomUUID();
          await supabase.from('restaurant_tables').update({ table_token: token }).eq('id', table.id);
        }
        loadTables(signal);
        return;
      }

      const sorted = (data || []).sort((a, b) => {
        const numA = Number(a.table_number) || 0;
        const numB = Number(b.table_number) || 0;
        return numA - numB;
      });

      if (!signal?.aborted) {
        setTables(sorted);
      }
    } catch (err) {
      console.error('Failed to load tables:', err);
      if (!signal?.aborted) {
        setError(err.name === 'AbortError' ? 'Request cancelled' : 'Failed to load tables');
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    mountedRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    loadTables(controller.signal);

    return () => {
      mountedRef.current = false;
      controller.abort();
      abortControllerRef.current = null;
    };
  }, [restaurantId, loadTables]);

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newTableNum.trim()) return;

    setAdding(true);
    setError(null);

    try {
      const newId = crypto.randomUUID();
      const token = crypto.randomUUID();

      const payload = {
        id: newId,
        restaurant_id: restaurantId,
        table_number: newTableNum.trim(),
        table_token: token
      };

      const { error: err } = await supabase
        .from('restaurant_tables')
        .insert(payload);

      if (err) throw err;

      setNewTableNum('');
      setShowAddForm(false);
      loadTables();
    } catch (err) {
      console.error('Failed to add table:', err);
      if (err.code === '23505') {
        setError(`Table number ${newTableNum} already exists.`);
      } else {
        setError('Failed to add table.');
      }
    } finally {
      setAdding(false);
    }
  };

  const deleteTable = async (id) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;

    try {
      const { error: err } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', id);

      if (err) throw err;

      setTables(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Failed to delete table:', err);
      setError('Failed to delete table.');
    }
  };

  const handleEditTable = async (e) => {
    e.preventDefault();
    if (!editValue.trim() || !editingId) return;

    try {
      const { error: err } = await supabase
        .from('restaurant_tables')
        .update({ table_number: editValue.trim() })
        .eq('id', editingId);

      if (err) {
        if (err.code === '23505') {
          setError(`Table number ${editValue} already exists.`);
        } else {
          throw err;
        }
        return;
      }

      setEditingId(null);
      setEditValue('');
      loadTables();
    } catch (err) {
      console.error('Failed to edit table:', err);
      setError('Failed to update table.');
    }
  };

  const handlePrintQR = (id, tableNum, tableToken) => {
    if (!tableToken) {
      alert('This table is missing a security token. Please refresh to generate one.');
      return;
    }
    const qrUrl = `${FINAL_BASE_URL}?table=${encodeURIComponent(tableToken)}`;
    const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrUrl)}`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR - Table ${tableNum}</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h1 { font-size: 2rem; margin-bottom: 2rem; }
            img { width: 400px; height: 400px; margin-bottom: 2rem; }
            p { color: #666; font-size: 1.2rem; margin-top: 1rem; }
            @media print {
              body { justify-content: flex-start; padding-top: 50px; }
            }
          </style>
        </head>
        <body>
          <h1>Table ${tableNum}</h1>
          <img src="${qrImageSrc}" alt="QR Code for Table ${tableNum}" onload="window.print(); window.onafterprint = function(){ window.close(); }" />
          <p>Scan to view menu & order</p>
          <p style="font-size: 0.9rem">${qrUrl}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const openEdit = (table) => {
    setEditingId(table.id);
    setEditValue(table.table_number);
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const filteredTables = tables.filter((t) => {
    const searchValue = search.toLowerCase();
    const tableNumber = String(t?.table_number || "").toLowerCase();
    const tableName = String(t?.name || "").toLowerCase();
    return tableNumber.includes(searchValue) || tableName.includes(searchValue);
  });

  if (loading) {
    return (
      <div className="tables-page">
        <div className="tables-loading-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="table-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tables-page">
      <div className="tables-header">
        <div className="tables-header-left">
          <h1 className="tables-title">Tables</h1>
          <span className="tables-count">{tables.length} total</span>
        </div>
        <div className="tables-header-right">
          <div className="tables-search-wrap">
            <span className="tables-search-icon">&#128269;</span>
            <input
              type="text"
              className="tables-search-input"
              placeholder="Search tables..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className="tables-add-btn"
            onClick={() => setShowAddForm(prev => !prev)}
          >
            + Add Table
          </button>
        </div>
      </div>

      {showAddForm && (
        <form className="tables-add-form" onSubmit={handleAddTable}>
          <input
            type="text"
            placeholder="Table number (e.g., 1, T1)"
            value={newTableNum}
            onChange={e => setNewTableNum(e.target.value)}
            autoFocus
            required
          />
          <button type="submit" className="tables-add-submit" disabled={adding}>
            {adding ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            className="tables-add-cancel"
            onClick={() => {
              setShowAddForm(false);
              setNewTableNum('');
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div className="tables-error">
          <span className="tables-error-msg">{error}</span>
          <button className="tables-error-retry" onClick={() => loadTables()}>
            Retry
          </button>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="tables-empty">
          <div className="tables-empty-icon">&#127960;</div>
          <h3>No tables found</h3>
          <p>Add your first table to generate QR codes for customer ordering.</p>
          <button
            className="tables-empty-btn"
            onClick={() => setShowAddForm(true)}
          >
            + Add Table
          </button>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="tables-empty">
          <div className="tables-empty-icon">&#128269;</div>
          <h3>No results</h3>
          <p>No tables match "{search}". Try a different search term.</p>
        </div>
      ) : (
        <div className="tables-grid">
          {filteredTables.map(table => (
            <div key={table.id} className="table-card">
              <div className="table-card-top">
                <div className="table-card-info">
                  <span className="table-number">Table {table.table_number}</span>
                </div>
                <div className="table-card-badges">
                  <span className="table-badge active">Active</span>
                  <span className={`table-badge ${table.table_token ? 'qr-ready' : 'qr-missing'}`}>
                    {table.table_token ? 'QR Ready' : 'QR Missing'}
                  </span>
                </div>
              </div>
              <div className="table-card-actions">
                <button className="table-action" onClick={() => openEdit(table)}>
                  Edit
                </button>
                <button
                  className="table-action qr"
                  onClick={() => handlePrintQR(table.id, table.table_number, table.table_token)}
                >
                  QR
                </button>
                <button className="table-action delete" onClick={() => deleteTable(table.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId && (
        <div className="tables-modal-overlay" onClick={closeEdit}>
          <div className="tables-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Table</h3>
            <p>Update the table number.</p>
            <form onSubmit={handleEditTable}>
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                autoFocus
                required
              />
              <div className="tables-modal-actions">
                <button type="submit" className="tables-modal-save">Save</button>
                <button type="button" className="tables-modal-cancel" onClick={closeEdit}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
