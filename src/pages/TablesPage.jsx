import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithTimeout } from '../lib/apiUtils';

const API_TIMEOUT = 15000;

export default function TablesPage({ restaurantId, restaurantSlug }) {
  const BASE_URL = `${window.location.origin.replace('5175', '5173')}/${restaurantSlug || 'default'}`;
  const FINAL_BASE_URL = window.location.origin.includes('localhost') 
    ? BASE_URL 
    : `https://qr-menu-app-gamma.vercel.app/${restaurantSlug || 'default'}`;
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTableNum, setNewTableNum] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

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
        console.warn(`Found ${missingTokens.length} tables without tokens. Auto-populating...`);
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
      loadTables();
    } catch (err) {
      console.error('Failed to add table:', err);
      if (err.code === '23505') {
        setError(`Table number ${newTableNum} already exists.`);
      } else {
        setError('Failed to add table. Check if table already exists.');
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
      setError('Failed to delete table. It might have associated orders.');
    }
  };

  const handlePrintQR = (id, tableNum, tableToken) => {
    if (!tableToken) {
      alert("This table is missing a security token. Please refresh the page to allow the system to generate one.");
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

  if (loading) {
    return (
      <div className="menu-section">
        <div className="loading-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-line" style={{ height: '200px' }}></div>
              <div className="skeleton-line"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="menu-section">
      <div className="menu-header-row" style={{ marginBottom: '20px' }}>
        <div className="menu-stats">
          <span className="stat-label">Total Tables</span>
          <span className="stat-value">{tables.length}</span>
        </div>
        <button onClick={() => loadTables()} className="refresh-btn-glass">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Failed to load tables</h3>
          <p>{error}</p>
          <button onClick={() => loadTables()} className="add-btn">
            Retry
          </button>
        </div>
      ) : null}

      <div className="menu-controls" style={{ display: 'flex', gap: '15px', marginBottom: '30px', alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleAddTable} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Table No. (e.g., 1, T1)"
            value={newTableNum}
            onChange={(e) => setNewTableNum(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
            required
          />

          <button type="submit" className="add-btn" disabled={adding}>
            {adding ? 'Adding...' : '+ Add Table'}
          </button>
        </form>
      </div>

      {tables.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🪑</div>
          <h3>No tables configured</h3>
          <p>Add your first table to generate a QR code for ordering.</p>
        </div>
      ) : (
        <div className="menu-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {tables.map(table => {
            const qrUrl = `${FINAL_BASE_URL}?table=${encodeURIComponent(table.table_token)}`;
            const qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}&margin=10`;
            
            return (
              <div key={table.id} className="order-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--card)' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.2rem' }}>Table {table.table_number}</h3>
                
                <div style={{ background: '#fff', padding: '10px', borderRadius: '10px', marginBottom: '15px' }}>
                  <img src={qrImageSrc} alt={`QR Code for Table ${table.table_number}`} width="180" height="180" />
                </div>
                

                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button 
                    className="action-btn" 
                    style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }}
                    onClick={() => handlePrintQR(table.id, table.table_number, table.table_token)}
                  >
                    🖨️ Print QR
                  </button>
                  <button 
                    className="decline-btn" 
                    style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                    onClick={() => deleteTable(table.id)}
                    title="Delete Table"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
