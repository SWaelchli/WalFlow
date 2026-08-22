import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { ExportIcon, ImportIcon } from '../symbols/IconLibrary';
import { useUnits } from '../../context/UnitContext';

export default function FittingStandardsTab({ canManage }) {
  const { isImperial } = useUnits();

  const [standards, setStandards] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL | reducer | pipe_schedule
  const [standardFilter, setStandardFilter] = useState('ALL'); // ALL | ASME | DIN_EN | CUSTOM

  // Action states
  const [isSeeding, setIsSeeding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Clone Modal
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneCode, setCloneCode] = useState('');
  const [cloneName, setCloneName] = useState('');

  // New Standard Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newStandardData, setNewStandardData] = useState({
    code: '',
    name: '',
    standard: 'CUSTOM',
    fitting_type: 'reducer',
    subtype: 'concentric',
    description: ''
  });

  const fileInputRef = useRef(null);

  // Fetch standards catalog
  const fetchStandards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/fitting-standards');
      setStandards(res.data);
      if (res.data.length > 0 && !selectedId) {
        setSelectedId(res.data[0].id);
      }
    } catch {
      setError('Failed to fetch fitting standards and schedules catalog.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchStandards();
  }, [fetchStandards]);

  const selectedStandard = standards.find(s => s.id === selectedId) || standards[0] || null;

  // Filtered standards for sidebar
  const filteredStandards = standards.filter(item => {
    if (typeFilter !== 'ALL' && item.fitting_type !== typeFilter) return false;
    if (standardFilter !== 'ALL' && item.standard !== standardFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = item.code.toLowerCase().includes(q);
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      return matchCode || matchName || matchDesc;
    }
    return true;
  });

  // Re-seed defaults
  const handleSeedDefaults = async () => {
    setIsSeeding(true);
    try {
      const res = await axios.post('/api/fitting-standards/seed-defaults');
      alert(`Default standards successfully synchronized (${res.data.seeded_count || 0} restored).`);
      fetchStandards();
    } catch {
      alert('Failed to re-seed default fitting standards.');
    } finally {
      setIsSeeding(false);
    }
  };

  // Export JSON library
  const handleExportLibrary = async () => {
    try {
      const res = await axios.get('/api/fitting-standards/export-library');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `walflow_fitting_standards_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch {
      alert('Failed to export fitting standards library.');
    }
  };

  // Import JSON library
  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const payload = Array.isArray(parsed) ? parsed : [parsed];
        const res = await axios.post('/api/fitting-standards/import-library', payload);
        alert(`Import completed! Imported: ${res.data.imported || 0}, Updated: ${res.data.updated || 0}, Skipped: ${res.data.skipped || 0}`);
        fetchStandards();
      } catch (err) {
        alert(`Failed to import JSON library: ${err?.response?.data?.detail || err.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Start Clone
  const handleOpenCloneModal = () => {
    if (!selectedStandard) return;
    setCloneCode(`${selectedStandard.code}_CUSTOM`);
    setCloneName(`${selectedStandard.name} (Custom Copy)`);
    setIsCloneModalOpen(true);
  };

  const handleConfirmClone = async () => {
    if (!cloneCode.trim() || !cloneName.trim()) {
      alert('Please enter a valid unique code and descriptive name.');
      return;
    }
    try {
      const res = await axios.post(`/api/fitting-standards/${selectedStandard.id}/clone`, {
        new_code: cloneCode.trim().toUpperCase(),
        new_name: cloneName.trim()
      });
      alert(`Cloned standard '${res.data.code}' created successfully.`);
      setIsCloneModalOpen(false);
      await fetchStandards();
      setSelectedId(res.data.id);
    } catch (err) {
      alert(`Clone failed: ${err?.response?.data?.detail || err.message}`);
    }
  };

  // Start Create New Standard
  const handleCreateNewStandard = async () => {
    if (!newStandardData.code.trim() || !newStandardData.name.trim()) {
      alert('Please provide both standard code and name.');
      return;
    }
    try {
      const res = await axios.post('/api/fitting-standards', {
        code: newStandardData.code.trim().toUpperCase(),
        name: newStandardData.name.trim(),
        standard: newStandardData.standard,
        fitting_type: newStandardData.fitting_type,
        subtype: newStandardData.subtype,
        description: newStandardData.description,
        dimensions: []
      });
      alert(`Created custom standard '${res.data.code}'.`);
      setIsNewModalOpen(false);
      await fetchStandards();
      setSelectedId(res.data.id);
    } catch (err) {
      alert(`Creation failed: ${err?.response?.data?.detail || err.message}`);
    }
  };

  // Delete Custom Standard
  const handleDeleteStandard = async (item) => {
    if (item.is_builtin) {
      alert('Built-in standard library components cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete custom standard '${item.code}'?`)) {
      return;
    }
    try {
      await axios.delete(`/api/fitting-standards/${item.id}`);
      alert(`Standard '${item.code}' deleted.`);
      await fetchStandards();
      setSelectedId(null);
    } catch (err) {
      alert(`Delete failed: ${err?.response?.data?.detail || err.message}`);
    }
  };

  // Start Inline Edit
  const handleStartEdit = () => {
    if (!selectedStandard || selectedStandard.is_builtin) return;
    setEditFormData(JSON.parse(JSON.stringify(selectedStandard)));
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    setIsSaving(true);
    try {
      const res = await axios.put(`/api/fitting-standards/${editFormData.id}`, {
        name: editFormData.name,
        standard: editFormData.standard,
        fitting_type: editFormData.fitting_type,
        subtype: editFormData.subtype,
        description: editFormData.description,
        dimensions: editFormData.dimensions
      });
      alert('Standard updated successfully.');
      setIsEditing(false);
      setEditFormData(null);
      await fetchStandards();
      setSelectedId(res.data.id);
    } catch (err) {
      alert(`Save failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Add Reducer Dimension Row in Edit Mode
  const handleAddReducerRow = () => {
    if (!editFormData) return;
    const newRow = {
      dn_large: 50,
      nps_large: "2",
      od_large_mm: 60.3,
      dn_small: 40,
      nps_small: "1 1/2",
      od_small_mm: 48.3,
      length_mm: 76.0,
      cone_angle_deg: 9.0
    };
    setEditFormData(prev => ({
      ...prev,
      dimensions: [...(prev.dimensions || []), newRow]
    }));
  };

  const handleRemoveDimensionRow = (idx) => {
    if (!editFormData) return;
    setEditFormData(prev => ({
      ...prev,
      dimensions: prev.dimensions.filter((_, i) => i !== idx)
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Sub-header Controls Bar */}
      <div style={{
        height: '48px',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: '#FFFFFF'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-brand-dark)' }}>
            Fitting Standards & Pipe Schedules Catalog
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px' }}>
            {standards.length} Standards Available
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canManage && (
            <button
              onClick={handleSeedDefaults}
              disabled={isSeeding || isEditing}
              className="btn-secondary"
              style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700' }}
              title="Restore standard default built-ins (ASME B16.9, ASME B36.10M)"
            >
              {isSeeding ? 'Restoring...' : 'Restore Defaults'}
            </button>
          )}

          <button
            onClick={handleExportLibrary}
            className="btn-secondary"
            style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700', gap: '4px' }}
            title="Export fitting standards catalog as JSON file"
          >
            <ExportIcon size={12} />
            Export Fittings JSON
          </button>

          {canManage && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".json"
                onChange={handleFileImport}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isEditing}
                className="btn-secondary"
                style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700', gap: '4px' }}
                title="Import fitting standards from JSON file"
              >
                <ImportIcon size={12} />
                Import Fittings JSON
              </button>

              <button
                onClick={() => setIsNewModalOpen(true)}
                disabled={isEditing}
                className="btn-primary"
                style={{ height: '32px', padding: '0 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}
              >
                + New Standard
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar: Standards List & Search */}
        <div style={{
          width: '320px',
          borderRight: '1px solid var(--color-border)',
          backgroundColor: '#FAFCFC',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search and Filters */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              style={{ width: '100%', height: '30px', fontSize: '12px' }}
              placeholder="Search standards & schedules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <select
                className="form-select"
                style={{ height: '28px', fontSize: '11px' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="reducer">Reducers</option>
                <option value="pipe_schedule">Schedules</option>
              </select>

              <select
                className="form-select"
                style={{ height: '28px', fontSize: '11px' }}
                value={standardFilter}
                onChange={(e) => setStandardFilter(e.target.value)}
              >
                <option value="ALL">All Standards</option>
                <option value="ASME">ASME</option>
                <option value="DIN_EN">DIN EN</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
          </div>

          {/* List items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {error && (
              <div style={{ padding: '8px 12px', marginBottom: '8px', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '11px' }}>
                {error}
              </div>
            )}
            {loading ? (

              <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                Loading standards...
              </div>
            ) : filteredStandards.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                No standards match filter.
              </div>
            ) : (
              filteredStandards.map(item => {
                const isSelected = item.id === selectedId;
                const dimCount = Array.isArray(item.dimensions) ? item.dimensions.length : 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isEditing) {
                        if (!window.confirm("You have unsaved changes. Discard and switch?")) return;
                        setIsEditing(false);
                      }
                      setSelectedId(item.id);
                    }}
                    style={{
                      padding: '10px 12px',
                      marginBottom: '6px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      backgroundColor: isSelected ? '#FFFFFF' : '#FFFFFF',
                      boxShadow: isSelected ? '0 2px 6px rgba(250,133,7,0.12)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: isSelected ? 'var(--color-primary)' : 'var(--color-brand-dark)' }}>
                        {item.code}
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {item.is_builtin ? (
                          <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1' }}>
                            BUILT-IN
                          </span>
                        ) : (
                          <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#b45309' }}>
                            CUSTOM
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: '#334155', fontWeight: '500', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
                      <span>Type: {item.fitting_type === 'reducer' ? 'Reducer / Expander' : 'Pipe Schedules'}</span>
                      <span>{dimCount} {item.fitting_type === 'reducer' ? 'sizes' : 'DN entries'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Main Panel: Detail View & Table Editor */}
        <div style={{ flex: 1, backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedStandard ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              {/* Standard Header Banner */}
              <div style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--color-border)',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--color-brand-dark)' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontSize: '16px', fontWeight: '700', height: '32px' }}
                          value={editFormData?.name || ''}
                          onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                        />
                      ) : (
                        selectedStandard.name
                      )}
                    </h2>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: '#395253', color: '#ffffff' }}>
                      {selectedStandard.code}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: '#e2e8f0', color: '#334155' }}>
                      {selectedStandard.standard}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: '12px', width: '450px' }}
                        value={editFormData?.description || ''}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Description..."
                      />
                    ) : (
                      selectedStandard.description || 'Standard engineering fitting dimensions table.'
                    )}
                  </p>
                </div>

                {/* Header Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => { setIsEditing(false); setEditFormData(null); }}
                        className="btn-secondary"
                        style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                        className="btn-primary"
                        style={{ height: '32px', padding: '0 16px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleOpenCloneModal}
                        className="btn-secondary"
                        style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700' }}
                        title="Clone this standard into an editable custom version"
                      >
                        ⎘ Clone to Custom
                      </button>

                      {!selectedStandard.is_builtin && canManage && (
                        <>
                          <button
                            onClick={handleStartEdit}
                            className="btn-secondary"
                            style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700' }}
                          >
                            ✎ Edit Table
                          </button>
                          <button
                            onClick={() => handleDeleteStandard(selectedStandard)}
                            className="btn-destructive"
                            style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Table Data Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {selectedStandard.fitting_type === 'reducer' ? (
                  /* Reducer Dimensions Table */
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-brand-dark)' }}>
                        Standard Reducer Size Combinations (ASME B16.9 / Custom)
                      </span>
                      {isEditing && (
                        <button
                          onClick={handleAddReducerRow}
                          className="btn-secondary"
                          style={{ height: '28px', padding: '0 10px', fontSize: '11px', fontWeight: '700' }}
                        >
                          + Add Size Entry
                        </button>
                      )}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '8px 12px' }}>Large End (DN)</th>
                          <th style={{ padding: '8px 12px' }}>Large NPS</th>
                          <th style={{ padding: '8px 12px' }}>Large OD ({isImperial ? 'in' : 'mm'})</th>
                          <th style={{ padding: '8px 12px' }}>Small End (DN)</th>
                          <th style={{ padding: '8px 12px' }}>Small NPS</th>
                          <th style={{ padding: '8px 12px' }}>Small OD ({isImperial ? 'in' : 'mm'})</th>
                          <th style={{ padding: '8px 12px' }}>Length H ({isImperial ? 'in' : 'mm'})</th>
                          <th style={{ padding: '8px 12px' }}>Cone Angle (θ)</th>
                          {isEditing && <th style={{ padding: '8px 12px', textAlign: 'center' }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(isEditing ? editFormData.dimensions : selectedStandard.dimensions || []).map((row, idx) => {
                          const odLarge = isImperial ? (row.od_large_mm / 25.4).toFixed(3) : row.od_large_mm;
                          const odSmall = isImperial ? (row.od_small_mm / 25.4).toFixed(3) : row.od_small_mm;
                          const length = isImperial ? (row.length_mm / 25.4).toFixed(2) : row.length_mm;

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 12px', fontWeight: '600', color: '#1e293b' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    className="form-input"
                                    style={{ width: '60px', height: '24px' }}
                                    value={row.dn_large}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setEditFormData(prev => {
                                        const dims = [...prev.dimensions];
                                        dims[idx] = { ...dims[idx], dn_large: val };
                                        return { ...prev, dimensions: dims };
                                      });
                                    }}
                                  />
                                ) : (
                                  `DN${row.dn_large}`
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#475569' }}>
                                {row.nps_large ? `${row.nps_large}"` : '-'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#334155' }}>{odLarge}</td>
                              <td style={{ padding: '8px 12px', fontWeight: '600', color: '#1e293b' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    className="form-input"
                                    style={{ width: '60px', height: '24px' }}
                                    value={row.dn_small}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setEditFormData(prev => {
                                        const dims = [...prev.dimensions];
                                        dims[idx] = { ...dims[idx], dn_small: val };
                                        return { ...prev, dimensions: dims };
                                      });
                                    }}
                                  />
                                ) : (
                                  `DN${row.dn_small}`
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#475569' }}>
                                {row.nps_small ? `${row.nps_small}"` : '-'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#334155' }}>{odSmall}</td>
                              <td style={{ padding: '8px 12px', fontWeight: '600', color: '#0f766e' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    className="form-input"
                                    style={{ width: '70px', height: '24px' }}
                                    value={row.length_mm}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      setEditFormData(prev => {
                                        const dims = [...prev.dimensions];
                                        dims[idx] = { ...dims[idx], length_mm: val };
                                        return { ...prev, dimensions: dims };
                                      });
                                    }}
                                  />
                                ) : (
                                  length
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#334155' }}>
                                {row.cone_angle_deg ? `${row.cone_angle_deg.toFixed(1)}°` : '-'}
                              </td>
                              {isEditing && (
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <button
                                    onClick={() => handleRemoveDimensionRow(idx)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                                  >
                                    ✕
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Pipe Schedule Table */
                  <div>
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-brand-dark)' }}>
                        Nominal Pipe Dimensions & Schedule Matrix (ASME B36.10M / B36.19M)
                      </span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '8px 12px' }}>Nominal Size</th>
                          <th style={{ padding: '8px 12px' }}>NPS</th>
                          <th style={{ padding: '8px 12px' }}>OD ({isImperial ? 'in' : 'mm'})</th>
                          <th style={{ padding: '8px 12px' }}>STD (WT / ID)</th>
                          <th style={{ padding: '8px 12px' }}>Sch 40 (WT / ID)</th>
                          <th style={{ padding: '8px 12px' }}>Sch 80 (WT / ID)</th>
                          <th style={{ padding: '8px 12px' }}>XS (WT / ID)</th>
                          <th style={{ padding: '8px 12px' }}>Sch 160 (WT / ID)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedStandard.dimensions || []).map((row, idx) => {
                          const od = isImperial ? (row.od_mm / 25.4).toFixed(3) : row.od_mm;
                          const schs = row.schedules || {};

                          const formatSch = (schKey) => {
                            const entry = schs[schKey];
                            if (!entry) return <span style={{ color: '#cbd5e1' }}>—</span>;
                            const wt = isImperial ? (entry.wt_mm / 25.4).toFixed(3) : entry.wt_mm.toFixed(2);
                            const id = isImperial ? (entry.id_mm / 25.4).toFixed(3) : entry.id_mm.toFixed(2);
                            return <span>{wt} / <strong>{id}</strong></span>;
                          };

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px 12px', fontWeight: '700', color: '#1e293b' }}>DN{row.dn}</td>
                              <td style={{ padding: '8px 12px', color: '#475569' }}>{row.nps}"</td>
                              <td style={{ padding: '8px 12px', color: '#334155' }}>{od}</td>
                              <td style={{ padding: '8px 12px' }}>{formatSch('STD')}</td>
                              <td style={{ padding: '8px 12px' }}>{formatSch('40')}</td>
                              <td style={{ padding: '8px 12px' }}>{formatSch('80')}</td>
                              <td style={{ padding: '8px 12px' }}>{formatSch('XS')}</td>
                              <td style={{ padding: '8px 12px' }}>{formatSch('160')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
              Select a standard from the left sidebar to view specifications.
            </div>
          )}
        </div>
      </div>

      {/* Clone Standard Modal */}
      {isCloneModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', width: '440px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--color-brand-dark)' }}>
              Clone Standard to Editable Copy
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>New Unique Code</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={cloneCode}
                  onChange={(e) => setCloneCode(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>New Name</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setIsCloneModalOpen(false)} className="btn-secondary" style={{ height: '32px', padding: '0 12px' }}>
                Cancel
              </button>
              <button onClick={handleConfirmClone} className="btn-primary" style={{ height: '32px', padding: '0 16px', borderRadius: '8px' }}>
                Create Clone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Standard Modal */}
      {isNewModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', width: '480px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--color-brand-dark)' }}>
              Create Custom Fitting Standard
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Standard Code (e.g. ISO_PIPE_REDUCERS)</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.code}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, code: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Name</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.name}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Fitting Type</label>
                  <select
                    className="form-select"
                    style={{ width: '100%' }}
                    value={newStandardData.fitting_type}
                    onChange={(e) => setNewStandardData(prev => ({ ...prev, fitting_type: e.target.value }))}
                  >
                    <option value="reducer">Reducer / Expander</option>
                    <option value="pipe_schedule">Pipe Schedules</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Standard Group</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={newStandardData.standard}
                    onChange={(e) => setNewStandardData(prev => ({ ...prev, standard: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>Description</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.description}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setIsNewModalOpen(false)} className="btn-secondary" style={{ height: '32px', padding: '0 12px' }}>
                Cancel
              </button>
              <button onClick={handleCreateNewStandard} className="btn-primary" style={{ height: '32px', padding: '0 16px', borderRadius: '8px' }}>
                Create Standard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
