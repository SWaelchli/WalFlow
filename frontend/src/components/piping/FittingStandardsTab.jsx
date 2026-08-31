import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import axios from 'axios';
import { 
  PlusIcon, 
  TrashIcon, 
  CrossIcon, 
  CopyIcon, 
  EditIcon,
  CheckCircleIcon,
  WarningIcon
} from '../symbols/IconLibrary';
import { useUnits } from '../../context/UnitContext';

const FittingStandardsTab = forwardRef(function FittingStandardsTab({ canManage }, ref) {
  const { isImperial } = useUnits();

  const [standards, setStandards] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL | reducer | pipe_schedule
  const [standardFilter, setStandardFilter] = useState('ALL'); // ALL | ASME | DIN_EN | CUSTOM

  // Action states
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

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState(null); // { type: 'success'|'error', text: '' }

  const fileInputRef = useRef(null);

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

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
    try {
      const res = await axios.post('/api/fitting-standards/seed-defaults');
      showToast(`Default standards synchronized (${res.data.seeded_count || 0} restored).`);
      fetchStandards();
    } catch {
      showToast('Failed to restore default fitting standards.', 'error');
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
      showToast('Fitting standards catalog exported successfully.');
    } catch {
      showToast('Failed to export fitting standards library.', 'error');
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
        showToast(`Import completed! Imported: ${res.data.imported || 0}, Updated: ${res.data.updated || 0}, Skipped: ${res.data.skipped || 0}`);
        fetchStandards();
      } catch (err) {
        showToast(`Failed to import JSON library: ${err?.response?.data?.detail || err.message}`, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Expose header actions to parent via Ref
  useImperativeHandle(ref, () => ({
    seedDefaults: handleSeedDefaults,
    exportLibrary: handleExportLibrary,
    triggerImport: () => fileInputRef.current?.click(),
    openNewModal: () => setIsNewModalOpen(true)
  }));

  // Start Clone
  const handleOpenCloneModal = () => {
    if (!selectedStandard) return;
    setCloneCode(`${selectedStandard.code}_CUSTOM`);
    setCloneName(`${selectedStandard.name} (Custom Copy)`);
    setIsCloneModalOpen(true);
  };

  const handleConfirmClone = async () => {
    if (!cloneCode.trim() || !cloneName.trim()) {
      showToast('Please enter a valid unique code and descriptive name.', 'error');
      return;
    }
    try {
      const res = await axios.post(`/api/fitting-standards/${selectedStandard.id}/clone`, {
        new_code: cloneCode.trim().toUpperCase(),
        new_name: cloneName.trim()
      });
      showToast(`Cloned standard '${res.data.code}' created successfully.`);
      setIsCloneModalOpen(false);
      await fetchStandards();
      setSelectedId(res.data.id);
    } catch (err) {
      showToast(`Clone failed: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  };

  // Start Create New Standard
  const handleCreateNewStandard = async () => {
    if (!newStandardData.code.trim() || !newStandardData.name.trim()) {
      showToast('Please provide both standard code and name.', 'error');
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
      showToast(`Created custom standard '${res.data.code}'.`);
      setIsNewModalOpen(false);
      await fetchStandards();
      setSelectedId(res.data.id);
    } catch (err) {
      showToast(`Creation failed: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  };

  // Delete Custom Standard
  const handleDeleteStandard = async (item) => {
    if (item.is_builtin) {
      showToast('Built-in standard library components cannot be deleted.', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete custom standard '${item.code}'?`)) {
      return;
    }
    try {
      await axios.delete(`/api/fitting-standards/${item.id}`);
      showToast(`Standard '${item.code}' deleted.`);
      await fetchStandards();
      setSelectedId(null);
    } catch (err) {
      showToast(`Delete failed: ${err?.response?.data?.detail || err.message}`, 'error');
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
      showToast('Standard updated successfully.');
      setIsEditing(false);
      setEditFormData(null);
      await fetchStandards();
      setSelectedId(res.data.id);
    } catch (err) {
      showToast(`Save failed: ${err?.response?.data?.detail || err.message}`, 'error');
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
    <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden', position: 'relative' }}>
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".json"
        onChange={handleFileImport}
      />

      {/* Floating Toast Feedback */}
      {toastMessage && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '24px',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '8px',
          backgroundColor: toastMessage.type === 'error' ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${toastMessage.type === 'error' ? '#FEE2E2' : '#DCFCE7'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          animation: 'walflowFadeIn 0.2s ease-out'
        }}>
          {toastMessage.type === 'error' ? (
            <WarningIcon size={16} color="#DC2626" />
          ) : (
            <CheckCircleIcon size={16} color="#16A34A" />
          )}
          <span style={{
            fontSize: '12px',
            fontWeight: '600',
            color: toastMessage.type === 'error' ? '#DC2626' : '#16A34A'
          }}>
            {toastMessage.text}
          </span>
        </div>
      )}

      {/* Left Sidebar: Catalog Listing & Segmented Filter Pills */}
      <aside style={{
        width: '320px',
        borderRight: '1px solid var(--color-border)',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}>
        {/* Search & Filter Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', height: '34px', fontSize: '12px' }}
            placeholder="Search standards & schedules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Type Filter Pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { key: 'ALL', label: 'All' },
              { key: 'reducer', label: 'Reducers' },
              { key: 'pipe_schedule', label: 'Schedules' }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setTypeFilter(item.key)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: typeFilter === item.key ? 'var(--color-brand-dark)' : 'var(--color-surface-light)',
                  color: typeFilter === item.key ? '#FFFFFF' : 'var(--color-text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Standard Filter Pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { key: 'ALL', label: 'All' },
              { key: 'ASME', label: 'ASME' },
              { key: 'DIN_EN', label: 'DIN EN' },
              { key: 'CUSTOM', label: 'Custom' }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setStandardFilter(item.key)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: standardFilter === item.key ? 'var(--color-brand-dark)' : 'var(--color-surface-light)',
                  color: standardFilter === item.key ? '#FFFFFF' : 'var(--color-text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* List of Standards */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
          {error && (
            <div style={{ color: 'var(--color-danger)', fontSize: '12px', padding: '10px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Loading catalog...
            </div>
          ) : filteredStandards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              No fitting standards match criteria.
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
                    borderRadius: '8px',
                    marginBottom: '6px',
                    backgroundColor: isSelected ? 'rgba(250, 133, 7, 0.08)' : 'transparent',
                    border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{
                      fontWeight: '800',
                      fontSize: '13px',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)'
                    }}>
                      {item.code}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {item.is_builtin ? (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#E2E8F0',
                          color: '#475569'
                        }}>
                          BUILT-IN
                        </span>
                      ) : (
                        <span style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(250, 133, 7, 0.15)',
                          color: 'var(--color-primary)'
                        }}>
                          CUSTOM
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    fontSize: '11px',
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '4px'
                  }}>
                    {item.name}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                    <span>{item.fitting_type === 'reducer' ? 'Reducer / Expander' : 'Pipe Schedules'}</span>
                    <span>{dimCount} {item.fitting_type === 'reducer' ? 'sizes' : 'DN entries'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Panel: Elevated Card-Based Detail View */}
      <main style={{
        flexGrow: 1,
        backgroundColor: 'var(--color-bg-canvas)',
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {selectedStandard ? (
          <>
            {/* Card 1: Standard Header Banner */}
            <div style={{
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border)',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <h2 style={{
                    margin: 0,
                    fontSize: '22px',
                    fontWeight: '800',
                    color: 'var(--color-brand-dark)',
                    fontFamily: 'inherit'
                  }}>
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: '18px', fontWeight: '800', height: '36px' }}
                        value={editFormData?.name || ''}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
                      />
                    ) : (
                      selectedStandard.name
                    )}
                  </h2>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-brand-dark)',
                    color: '#FFFFFF'
                  }}>
                    {selectedStandard.code}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-surface-light)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)'
                  }}>
                    {selectedStandard.standard}
                  </span>
                </div>

                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                  maxWidth: '700px'
                }}>
                  {isEditing ? (
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: '12px', width: '500px' }}
                      value={editFormData?.description || ''}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Description of standard..."
                    />
                  ) : (
                    selectedStandard.description || 'Standard engineering fitting dimensions table.'
                  )}
                </p>
              </div>

              {/* Action Buttons */}
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
                      style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700', gap: '6px' }}
                      title="Clone standard into an editable custom version"
                    >
                      <CopyIcon size={12} />
                      Clone Standard
                    </button>

                    {!selectedStandard.is_builtin && canManage && (
                      <>
                        <button
                          onClick={handleStartEdit}
                          className="btn-secondary"
                          style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700', gap: '6px' }}
                        >
                          <EditIcon size={12} />
                          Edit Table
                        </button>
                        <button
                          onClick={() => handleDeleteStandard(selectedStandard)}
                          className="btn-danger-ghost"
                          style={{ height: '32px', padding: '0 12px', fontSize: '11px', fontWeight: '700', gap: '6px' }}
                        >
                          <TrashIcon size={12} />
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Card 2: Dimensional Table Card */}
            <div style={{
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--color-border)',
              padding: '20px 24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: '800',
                  color: 'var(--color-brand-dark)',
                  fontFamily: 'inherit'
                }}>
                  {selectedStandard.fitting_type === 'reducer' 
                    ? 'Standard Reducer Size Combinations (ASME B16.9 / Custom)'
                    : 'Nominal Pipe Dimensions & Schedule Matrix (ASME B36.10M / B36.19M)'}
                </h3>
                {isEditing && selectedStandard.fitting_type === 'reducer' && (
                  <button
                    onClick={handleAddReducerRow}
                    className="btn-secondary"
                    style={{ height: '28px', padding: '0 10px', fontSize: '11px', fontWeight: '700', gap: '4px' }}
                  >
                    <PlusIcon size={12} />
                    Add Size Row
                  </button>
                )}
              </div>

              {selectedStandard.fitting_type === 'reducer' ? (
                /* Reducer Dimensions Table */
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{
                      borderBottom: '2px solid var(--color-border)',
                      textAlign: 'left',
                      color: 'var(--color-text-secondary)',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>
                      <th style={{ padding: '8px 12px' }}>Large End (DN)</th>
                      <th style={{ padding: '8px 12px' }}>Large NPS</th>
                      <th style={{ padding: '8px 12px' }}>Large OD ({isImperial ? 'in' : 'mm'})</th>
                      <th style={{ padding: '8px 12px' }}>Small End (DN)</th>
                      <th style={{ padding: '8px 12px' }}>Small NPS</th>
                      <th style={{ padding: '8px 12px' }}>Small OD ({isImperial ? 'in' : 'mm'})</th>
                      <th style={{ padding: '8px 12px' }}>Length H ({isImperial ? 'in' : 'mm'})</th>
                      <th style={{ padding: '8px 12px' }}>Cone Angle (θ)</th>
                      {isEditing && <th style={{ padding: '8px 12px', textAlign: 'center' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(isEditing ? editFormData.dimensions : selectedStandard.dimensions || []).map((row, idx) => {
                      const odLarge = isImperial ? (row.od_large_mm / 25.4).toFixed(3) : row.od_large_mm;
                      const odSmall = isImperial ? (row.od_small_mm / 25.4).toFixed(3) : row.od_small_mm;
                      const length = isImperial ? (row.length_mm / 25.4).toFixed(2) : row.length_mm;

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                className="form-input"
                                style={{ width: '60px', height: '26px' }}
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
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>
                            {row.nps_large ? `${row.nps_large}"` : '-'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)' }}>{odLarge}</td>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                className="form-input"
                                style={{ width: '60px', height: '26px' }}
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
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>
                            {row.nps_small ? `${row.nps_small}"` : '-'}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)' }}>{odSmall}</td>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--color-brand-dark)' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                className="form-input"
                                style={{ width: '70px', height: '26px' }}
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
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>
                            {row.cone_angle_deg ? `${row.cone_angle_deg.toFixed(1)}°` : '-'}
                          </td>
                          {isEditing && (
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleRemoveDimensionRow(idx)}
                                className="btn-danger-ghost"
                                style={{ height: '24px', padding: '0 6px' }}
                                title="Remove size row"
                              >
                                <TrashIcon size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* Pipe Schedule Matrix */
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{
                      borderBottom: '2px solid var(--color-border)',
                      textAlign: 'left',
                      color: 'var(--color-text-secondary)',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>
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
                        if (!entry) return <span style={{ color: 'var(--color-border)' }}>—</span>;
                        const wt = isImperial ? (entry.wt_mm / 25.4).toFixed(3) : entry.wt_mm.toFixed(2);
                        const id = isImperial ? (entry.id_mm / 25.4).toFixed(3) : entry.id_mm.toFixed(2);
                        return <span>{wt} / <strong>{id}</strong></span>;
                      };

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--color-text-primary)' }}>DN{row.dn}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>{row.nps}"</td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-primary)' }}>{od}</td>
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
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
            Select a fitting standard from the left sidebar to view details.
          </div>
        )}
      </main>

      {/* CLONE STANDARD MODAL */}
      {isCloneModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 133, 7, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary)'
                }}>
                  <CopyIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title">Clone Fitting Standard</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Create an editable custom copy of {selectedStandard?.code}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsCloneModalOpen(false)} className="modal-close-btn">
                <CrossIcon size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                  New Standard Code
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={cloneCode}
                  onChange={(e) => setCloneCode(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                  New Standard Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setIsCloneModalOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmClone} className="btn-primary">
                Create Clone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW STANDARD MODAL */}
      {isNewModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 133, 7, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary)'
                }}>
                  <PlusIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title">Create Custom Fitting Standard</h3>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Add a new standard catalog or schedule matrix
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="modal-close-btn">
                <CrossIcon size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                  Standard Code (e.g. ISO_5251_REDUCERS)
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.code}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, code: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                  Standard Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.name}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                    Fitting Type
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '34px' }}
                    value={newStandardData.fitting_type}
                    onChange={(e) => setNewStandardData(prev => ({ ...prev, fitting_type: e.target.value }))}
                  >
                    <option value="reducer">Reducer / Expander</option>
                    <option value="pipe_schedule">Pipe Schedules</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                    Standard Group
                  </label>
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
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' }}>
                  Description
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.description}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setIsNewModalOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreateNewStandard} className="btn-primary">
                Create Standard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default FittingStandardsTab;
