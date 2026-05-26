import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchWithTimeout } from '../lib/apiUtils';
import { IconTable, IconSearch } from '../components/Icons';
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
  const [editActive, setEditActive] = useState(true);

  const [viewingQR, setViewingQR] = useState(null);
  const [customizingQR, setCustomizingQR] = useState(null);
  const [qrPrefs, setQrPrefs] = useState({});
  const [restaurantLogo, setRestaurantLogo] = useState('');
  const [qrColor, setQrColor] = useState('#000000');
  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');
  const [qrRounded, setQrRounded] = useState(false);
  const [qrLogo, setQrLogo] = useState(false);

  const mountedRef = useRef(false);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (!restaurantId) return;
    supabase.from('restaurants').select('logo').eq('id', restaurantId).maybeSingle()
      .then(({ data }) => {
        if (data?.logo) setRestaurantLogo(data.logo);
      })
      .catch(() => {});
  }, [restaurantId]);

  const loadTables = useCallback(async (signal = null) => {
    if (!signal && mountedRef.current) setLoading(true);
    setError(null);

    try {
      const tablesPromise = supabase
        .from('restaurant_tables')
        .select(`
          id,
          table_number,
          name,
          is_active
        `)
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
    if (typeof newTableNum !== "string" || !newTableNum.trim()) return;

    setAdding(true);
    setError(null);

    try {
      const newId = crypto.randomUUID();
      const token = crypto.randomUUID();

      const payload = {
        id: newId,
        restaurant_id: restaurantId,
        table_number: typeof newTableNum === "string" ? newTableNum.trim() : newTableNum,
        is_active: true,
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
    if (typeof editValue !== "string" || !editValue.trim() || !editingId) return;

    const currentTable = tables.find(t => t.id === editingId);
    console.log("[Current Table]", currentTable);
    console.log("[Status Before]", currentTable?.is_active);
    console.log("[Status After]", editActive);

    const payload = {
      table_number: typeof editValue === "string" ? editValue.trim() : editValue,
      is_active: editActive,
    };

    console.log("[Saving]", payload);

    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .update(payload)
        .eq('id', editingId)
        .select();

      if (error) {
        console.error("[Table Update Error]", error);
        if (error.code === '23505') {
          setError(`Table number ${editValue} already exists.`);
        } else {
          throw error;
        }
        return;
      }

      setTables(prev => prev.map(t => t.id === editingId ? data[0] : t));

      setEditingId(null);
      setEditValue('');
      loadTables();
    } catch (err) {
      console.error("[Table Update Error]", err);
      setError('Failed to update table.');
    }
  };

  const getQRImageUrl = (table, prefs) => {
    const p = prefs || {};
    const color = (p.color || '#000000').replace('#', '');
    const bgColor = (p.bgColor || '#FFFFFF').replace('#', '');
    const qrUrl = `${FINAL_BASE_URL}?table=${encodeURIComponent(table.table_token)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrUrl)}&color=${color}&bgcolor=${bgColor}`;
  };

  const getQRCodeUrl = (table) => {
    return `${FINAL_BASE_URL}?table=${encodeURIComponent(table.table_token)}`;
  };

  const handleViewQR = (table) => {
    setViewingQR(table);
  };

  const handleCustomizeQR = (table) => {
    const existing = qrPrefs[table.id] || {};
    setCustomizingQR(table);
    setQrColor(existing.color || '#000000');
    setQrBgColor(existing.bgColor || '#FFFFFF');
    setQrRounded(existing.rounded || false);
    setQrLogo(existing.logo || false);
  };

  const handleSaveQrPrefs = () => {
    if (!customizingQR) return;
    setQrPrefs(prev => ({
      ...prev,
      [customizingQR.id]: {
        color: qrColor,
        bgColor: qrBgColor,
        rounded: qrRounded,
        logo: qrLogo
      }
    }));
    setCustomizingQR(null);
  };

  const handleDownloadQR = async (table) => {
    const prefs = qrPrefs[table.id] || {};
    const fgColor = (prefs.color || '#000000').replace('#', '');
    const bgColor = (prefs.bgColor || '#FFFFFF').replace('#', '');
    const isRounded = !!prefs.rounded;
    const showLogo = !!prefs.logo;

    const qrUrl = `${FINAL_BASE_URL}?table=${encodeURIComponent(table.table_token)}`;
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrUrl)}&color=${fgColor}&bgcolor=${bgColor}`;

    if (!isRounded && !showLogo) {
      try {
        const response = await fetch(apiUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Table-${table.table_number}-QR.png`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        window.open(apiUrl, '_blank');
      }
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 500;
      const ctx = canvas.getContext('2d');

      if (isRounded) {
        ctx.fillStyle = '#' + bgColor;
        ctx.beginPath();
        ctx.roundRect(0, 0, 500, 500, 40);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, 500, 500, 40);
        ctx.clip();
      }

      ctx.drawImage(img, 0, 0, 500, 500);

      if (isRounded) {
        ctx.restore();
      }

      if (showLogo && restaurantLogo) {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        try {
          await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
            logoImg.src = restaurantLogo;
          });
          const logoSize = 80;
          const logoX = (500 - logoSize) / 2;
          const logoY = (500 - logoSize) / 2;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8);
          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        } catch {
          /* logo failed to load, skip */
        }
      }

      const link = document.createElement('a');
      link.download = `Table-${table.table_number}-QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.onerror = () => {
      window.open(apiUrl, '_blank');
    };
    img.src = apiUrl;
  };

  const openEdit = (table) => {
    console.log("[Current Table]", table);
    console.log("[Status Before]", table.is_active);
    console.log("[Status After]", !table.is_active);
    setEditingId(table.id);
    setEditValue(table.table_number);
    setEditActive(table.is_active);
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditValue('');
    setEditActive(true);
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
          <input
            type="text"
            className="tables-search-input"
            placeholder="Search tables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
          <div className="tables-empty-icon"><IconTable size={48} /></div>
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
          <div className="tables-empty-icon"><IconSearch size={48} /></div>
          <h3>No results</h3>
          <p>No tables match "{search}". Try a different search term.</p>
        </div>
      ) : (
        <div className="tables-grid">
          {filteredTables.map(table => {
            const prefs = qrPrefs[table.id] || {};
            const isRounded = !!prefs.rounded;
            return (
              <div key={table.id} className="table-card">
                <div className="table-card-top">
                  <div className="table-card-info">
                    <span className="table-number">Table {table.table_number}</span>
                    {table.name && <span className="table-name-text">{table.name}</span>}
                  </div>
                  <div className="table-card-badges">
                    <span className={`table-badge ${table.is_active ? 'active' : 'inactive'}`}>
                      {table.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className={`table-badge ${table.table_token ? 'qr-ready' : 'qr-missing'}`}>
                      {table.table_token ? 'QR Ready' : 'QR Missing'}
                    </span>
                  </div>
                </div>
                <div className="table-card-actions">
                  <button className="table-action" onClick={() => openEdit(table)}>
                    Edit
                  </button>
                  <button className="table-action qr-view" onClick={() => handleViewQR(table)}>
                    View QR
                  </button>
                  <button className="table-action delete" onClick={() => deleteTable(table.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
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
              <div className="tables-modal-toggle">
                <label>Status</label>
                <button
                  type="button"
                  className={`table-toggle-btn ${editActive ? 'active' : 'inactive'}`}
                  onClick={() => setEditActive(!editActive)}
                >
                  {editActive ? 'Active' : 'Inactive'}
                </button>
              </div>
              <div className="tables-modal-actions">
                <button type="submit" className="tables-modal-save">Save</button>
                <button type="button" className="tables-modal-cancel" onClick={closeEdit}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingQR && (
        <div className="tables-modal-overlay" onClick={() => setViewingQR(null)}>
          <div className="tables-qr-modal" onClick={e => e.stopPropagation()}>
            <h3>Table {viewingQR.table_number}</h3>
            <p className="qr-subtitle">QR Code for customer ordering</p>
            <div className={`qr-image-wrap${qrPrefs[viewingQR.id]?.rounded ? ' rounded' : ''}`}>
              <img
                src={getQRImageUrl(viewingQR, qrPrefs[viewingQR.id])}
                alt={`QR for Table ${viewingQR.table_number}`}
              />
            </div>
            <p className="qr-url">{getQRCodeUrl(viewingQR)}</p>
            <div className="qr-modal-actions">
              <button
                className="qr-modal-btn customize"
                onClick={() => {
                  setViewingQR(null);
                  handleCustomizeQR(viewingQR);
                }}
              >
                Customize QR
              </button>
              <button
                className="qr-modal-btn primary"
                onClick={() => handleDownloadQR(viewingQR)}
              >
                Download
              </button>
              <button
                className="qr-modal-btn secondary"
                onClick={() => setViewingQR(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {customizingQR && (
        <div className="tables-modal-overlay" onClick={() => setCustomizingQR(null)}>
          <div className="tables-customize-modal" onClick={e => e.stopPropagation()}>
            <h3>Customize QR</h3>
            <p className="customize-subtitle">Table {customizingQR.table_number}</p>

            <div className="customize-layout">
              <div className="customize-preview">
                <span className="customize-preview-label">Preview</span>
                <div className={`preview-wrap${qrRounded ? ' rounded' : ''}`}>
                  <img
                    src={getQRImageUrl(customizingQR, {
                      color: qrColor,
                      bgColor: qrBgColor
                    })}
                    alt="QR Preview"
                  />
                </div>
              </div>

              <div className="customize-controls">
                <div className="customize-row">
                  <label>QR Color</label>
                  <div className="color-input-wrap">
                    <input type="color" value={qrColor} onChange={e => setQrColor(e.target.value)} />
                    <span className="color-hex">{qrColor}</span>
                  </div>
                </div>

                <div className="customize-row">
                  <label>Background</label>
                  <div className="color-input-wrap">
                    <input type="color" value={qrBgColor} onChange={e => setQrBgColor(e.target.value)} />
                    <span className="color-hex">{qrBgColor}</span>
                  </div>
                </div>

                <div className="customize-row">
                  <label>Rounded Style</label>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={qrRounded} onChange={e => setQrRounded(e.target.checked)} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="customize-row">
                  <label>Restaurant Logo</label>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={qrLogo} onChange={e => setQrLogo(e.target.checked)} disabled={!restaurantLogo} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="customize-actions">
                  <button className="save-btn" onClick={handleSaveQrPrefs}>Save</button>
                  <button className="close-btn" onClick={() => setCustomizingQR(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
