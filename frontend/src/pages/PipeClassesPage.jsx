import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import walflowLogo from '../assets/Logo_WalFlow.svg';
import { useAuth } from '../hooks/useAuth';
import { useUnits } from '../context/UnitContext';
import { APP_VERSION, RELEASE_STAGE } from '../constants';
import { 
  PlusIcon, 
  TrashIcon, 
  CrossIcon, 
  ExportIcon, 
  ImportIcon, 
  CrownIcon, 
  SignOutIcon, 
  SignInIcon 
} from '../components/symbols/IconLibrary';
import FittingStandardsTab from '../components/piping/FittingStandardsTab';

const PipeClassesPage = ({ onNavigateToCanvas, onOpenAuthModal, onOpenAdminHub, onOpenHelpModal }) => {
  const { currentUser, isAuthenticated, isAdmin, adminStatus, logout } = useAuth();
  const { isImperial } = useUnits();

  const [activeTab, setActiveTab] = useState('pipe_classes'); // 'pipe_classes' | 'fitting_standards'
  const [pipeClasses, setPipeClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [standardFilter, setStandardFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Import / Export and Examples states
  const fileInputRef = useRef(null);
  const [importReport, setImportReport] = useState(null);
  const [isImportReportModalOpen, setIsImportReportModalOpen] = useState(false);
  const [isSeedingExamples, setIsSeedingExamples] = useState(false);

  // Inline Editing & New Class states
  const [isEditing, setIsEditing] = useState(false);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [formData, setFormData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // New Class Mini-Dialog state
  const [isNewClassModalOpen, setIsNewClassModalOpen] = useState(false);
  const [newClassCode, setNewClassCode] = useState('');
  const [newClassName, setNewClassName] = useState('');

  // TR2000 Live Importer Modal State
  const [isTr2000ModalOpen, setIsTr2000ModalOpen] = useState(false);
  const [tr2000Plants, setTr2000Plants] = useState([]);
  const [selectedPlantId, setSelectedPlantId] = useState(109);
  const [tr2000SearchQuery, setTr2000SearchQuery] = useState('');
  const [tr2000Results, setTr2000Results] = useState([]);
  const [isSearchingTr2000, setIsSearchingTr2000] = useState(false);
  const [agreedToEquinorTerms, setAgreedToEquinorTerms] = useState(false);
  const [selectedTr2000Codes, setSelectedTr2000Codes] = useState(new Set());
  const [isSyncingTr2000, setIsSyncingTr2000] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState(null); // { current, total, currentCode }
  const [tr2000Error, setTr2000Error] = useState('');

  // Conflict Resolution Modal State
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictList, setConflictList] = useState([]); // [{ code, rev, name, action: 'update' | 'copy' | 'skip' }]
  const [nonConflictList, setNonConflictList] = useState([]); // [{ code, rev, name }]

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'pipe_manager';


  const fetchClasses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/pipe-classes');
      setPipeClasses(res.data);
      if (res.data.length > 0 && !selectedClassId) {
        setSelectedClassId(res.data[0].id);
      }
    } catch {
      setError('Failed to fetch pipe specifications catalog.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const handleSeedExamples = async () => {
    setIsSeedingExamples(true);
    try {
      const res = await axios.post('/api/pipe-classes/seed-examples');
      alert(res.data.message || `Created ${res.data.created_count} default example specifications.`);
      fetchClasses();
    } catch {
      alert('Failed to initialize example specifications.');
    } finally {
      setIsSeedingExamples(false);
    }
  };

  const handleExportLibrary = async () => {
    try {
      const res = await axios.get('/api/pipe-classes/export/library');
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `walflow_pipe_classes_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch {
      alert('Failed to export pipe classes library.');
    }
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawJson = JSON.parse(event.target.result);
        const classesArray = Array.isArray(rawJson) ? rawJson : (rawJson.classes || [rawJson]);
        const res = await axios.post('/api/pipe-classes/import/library', { classes: classesArray });
        setImportReport(res.data);
        setIsImportReportModalOpen(true);
        fetchClasses();
      } catch (err) {
        alert(err.response?.data?.detail || 'Failed to parse or import JSON file. Please check file format.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const filteredClasses = useMemo(() => {
    return pipeClasses.filter(c => {
      if (standardFilter !== 'ALL' && c.standard !== standardFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = c.code.toLowerCase().includes(q);
        const matchName = c.name.toLowerCase().includes(q);
        const matchMat = c.material_grade.toLowerCase().includes(q);
        return matchCode || matchName || matchMat;
      }
      return true;
    });
  }, [pipeClasses, standardFilter, searchQuery]);

  const activeClass = useMemo(() => {
    if (isNewDraft && formData) return formData;
    return pipeClasses.find(c => c.id === selectedClassId) || pipeClasses[0] || null;
  }, [pipeClasses, selectedClassId, isNewDraft, formData]);

  // Current display object (formData in edit mode, activeClass in view mode)
  const currentSpec = isEditing && formData ? formData : activeClass;

  const fetchTr2000Search = async (plantId, query) => {
    setIsSearchingTr2000(true);
    setTr2000Error('');
    setSelectedTr2000Codes(new Set());
    try {
      const res = await axios.get('/api/pipe-classes/tr2000/search', {
        params: { plant_id: plantId, q: query }
      });
      setTr2000Results(res.data);
    } catch {
      setTr2000Error('Failed to query specifications from TR2000 API.');
    } finally {
      setIsSearchingTr2000(false);
    }
  };

  const handleOpenTr2000Modal = async () => {
    if (isEditing) {
      if (!window.confirm("You have unsaved changes. Discard changes and import from TR2000?")) return;
      handleCancelEdit();
    }
    setIsTr2000ModalOpen(true);
    setTr2000Error('');
    setSelectedTr2000Codes(new Set());
    try {
      const res = await axios.get('/api/pipe-classes/tr2000/plants');
      setTr2000Plants(res.data);
      if (res.data.length > 0) {
        const uon = res.data.find(p => p.PlantCode === 'UON' || p.PlantID === 109);
        const plantId = uon ? uon.PlantID : res.data[0].PlantID;
        setSelectedPlantId(plantId);
        fetchTr2000Search(plantId, tr2000SearchQuery);
      }
    } catch {
      setTr2000Error('Failed to connect to Equinor TR2000 REST service.');
    }
  };

  const handlePlantChange = (newPlantId) => {
    const pId = parseInt(newPlantId, 10);
    setSelectedPlantId(pId);
    fetchTr2000Search(pId, tr2000SearchQuery);
  };

  const handleSearchTr2000Submit = (e) => {
    e.preventDefault();
    fetchTr2000Search(selectedPlantId, tr2000SearchQuery);
  };

  // --- TR2000 Batch Selection Handlers ---
  const handleToggleSelectTr2000Spec = (code) => {
    setSelectedTr2000Codes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSelectAllTr2000 = () => {
    const codes = tr2000Results.map(item => item.PcsCode || item.Code || item.pcs_code || item.PCS).filter(Boolean);
    setSelectedTr2000Codes(new Set(codes));
  };

  const handleUnselectAllTr2000 = () => {
    setSelectedTr2000Codes(new Set());
  };

  const visibleTr2000Codes = useMemo(() => {
    return tr2000Results.map(item => item.PcsCode || item.Code || item.pcs_code || item.PCS).filter(Boolean);
  }, [tr2000Results]);

  const isAllVisibleSelected = visibleTr2000Codes.length > 0 && visibleTr2000Codes.every(c => selectedTr2000Codes.has(c));

  const handleToggleMasterCheckbox = () => {
    if (isAllVisibleSelected) {
      handleUnselectAllTr2000();
    } else {
      handleSelectAllTr2000();
    }
  };

  // --- Batch Import & Duplicate Conflict Resolution ---
  const handleStartBatchImport = () => {
    if (!agreedToEquinorTerms) {
      alert("You must review and agree to Equinor's Terms and Conditions before downloading TR2000 specifications.");
      return;
    }
    if (selectedTr2000Codes.size === 0) {
      alert("Please select at least one specification to import.");
      return;
    }

    const existingCodeMap = new Map();
    pipeClasses.forEach(c => {
      if (c.code) existingCodeMap.set(c.code.toUpperCase(), c);
    });

    const selectedItems = tr2000Results
      .filter(item => {
        const code = item.PcsCode || item.Code || item.pcs_code || item.PCS;
        return selectedTr2000Codes.has(code);
      })
      .map(item => ({
        code: item.PcsCode || item.Code || item.pcs_code || item.PCS,
        rev: item.RevID || item.Revision || 'A',
        description: item.Description || item.description || item.PcsCode || item.Code,
        rating: item.RatingClass || item.rating_class || '',
        material: item.MaterialGroup || item.MaterialGrade || ''
      }));

    const conflicts = [];
    const nonConflicts = [];

    for (const item of selectedItems) {
      if (existingCodeMap.has(item.code.toUpperCase())) {
        conflicts.push({
          ...item,
          existingSpec: existingCodeMap.get(item.code.toUpperCase()),
          action: 'update'
        });
      } else {
        nonConflicts.push({ ...item, action: 'update' });
      }
    }

    if (conflicts.length > 0) {
      setConflictList(conflicts);
      setNonConflictList(nonConflicts);
      setIsConflictModalOpen(true);
    } else {
      executeBatchImport(selectedItems.map(i => ({ ...i, action: 'update' })));
    }
  };

  const handleSetAllConflictActions = (action) => {
    setConflictList(prev => prev.map(item => ({ ...item, action })));
  };

  const handleUpdateSingleConflictAction = (code, action) => {
    setConflictList(prev => prev.map(item => item.code === code ? { ...item, action } : item));
  };

  const executeBatchImport = async (itemsToImport) => {
    setIsConflictModalOpen(false);
    setIsSyncingTr2000(true);
    setTr2000Error('');

    const activeQueue = itemsToImport.filter(i => i.action !== 'skip');
    if (activeQueue.length === 0) {
      setIsSyncingTr2000(false);
      setIsTr2000ModalOpen(false);
      return;
    }

    let successCount = 0;
    const errors = [];
    let lastImportedId = null;

    for (let idx = 0; idx < activeQueue.length; idx++) {
      const item = activeQueue[idx];
      setBatchSyncProgress({
        current: idx + 1,
        total: activeQueue.length,
        currentCode: item.code
      });

      try {
        const res = await axios.post('/api/pipe-classes/tr2000/sync', {
          plant_id: selectedPlantId,
          pcs_code: item.code,
          rev_id: item.rev,
          conflict_action: item.action,
          agreed_to_terms: true
        });
        successCount++;
        lastImportedId = res.data.id;
      } catch (err) {
        errors.push(`${item.code}: ${err.response?.data?.detail || err.message}`);
      }
    }

    setIsSyncingTr2000(false);
    setBatchSyncProgress(null);

    await fetchClasses();
    if (lastImportedId) {
      setSelectedClassId(lastImportedId);
    }

    if (errors.length > 0) {
      setTr2000Error(`Imported ${successCount} specifications. ${errors.length} failed: ${errors.join(', ')}`);
    } else {
      setIsTr2000ModalOpen(false);
      setSelectedTr2000Codes(new Set());
    }
  };


  // --- Inline Edit & New Class Actions ---

  const handleStartEdit = () => {
    if (!activeClass) return;
    setIsNewDraft(false);
    setIsEditing(true);
    setFormData({
      ...activeClass,
      sizes: activeClass.sizes.map(s => ({ ...s })),
      temp_pressures: (activeClass.temp_pressures || []).map(tp => ({ ...tp }))
    });
  };

  const handleStartNewClass = () => {
    if (isEditing) {
      if (!window.confirm("You have unsaved changes. Discard changes and create a new pipe class?")) return;
      handleCancelEdit();
    }
    setNewClassCode('CS02');
    setNewClassName('');
    setIsNewClassModalOpen(true);
  };

  const handleConfirmNewClass = (e) => {
    e.preventDefault();
    if (!newClassCode.trim() || !newClassName.trim()) {
      alert("Please fill in both Class Code and Class Name.");
      return;
    }
    const code = newClassCode.trim().toUpperCase();
    const name = newClassName.trim();
    setIsNewClassModalOpen(false);
    setIsNewDraft(true);
    setIsEditing(true);
    setFormData({
      id: `draft_${Date.now()}`,
      code: code,
      name: name,
      standard: 'CUSTOM',
      material_group: 'CS',
      material_grade: 'ASTM A106 Gr. B',
      rating_class: 'CL150',
      design_code: 'ASME B31.3',
      revision: '1.0',
      roughness_mm: 0.045,
      corrosion_allowance_mm: 3.0,
      min_temp_c: -29,
      max_temp_c: 200,
      sizes: [
        { dn: 50, nps: "2", od_mm: 60.3, wt_mm: 3.91, sch: "STD", ca_mm: 3.0 }
      ],
      temp_pressures: [
        { temp_c: 20.0, press_bar: 19.6 }
      ]
    });
  };

  const handleCloneClass = (source) => {
    if (isEditing) {
      if (!window.confirm("You have unsaved changes. Discard changes and clone this spec?")) return;
    }
    setIsNewDraft(true);
    setIsEditing(true);
    setFormData({
      id: `draft_${Date.now()}`,
      code: `${source.code}_COPY`,
      name: `${source.name} (Copy)`,
      standard: 'CUSTOM',
      material_group: source.material_group,
      material_grade: source.material_grade,
      rating_class: source.rating_class,
      design_code: source.design_code || 'ASME B31.3',
      revision: '1.0',
      roughness_mm: source.roughness_mm,
      corrosion_allowance_mm: source.corrosion_allowance_mm,
      min_temp_c: source.min_temp_c ?? -29,
      max_temp_c: source.max_temp_c ?? 200,
      sizes: source.sizes.map(s => ({ ...s })),
      temp_pressures: (source.temp_pressures || []).map(tp => ({ ...tp }))
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsNewDraft(false);
    setFormData(null);
  };

  const handleSaveEdit = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      alert("Please fill in required Class Code and Class Name.");
      return;
    }
    if (!formData.sizes || formData.sizes.length === 0) {
      alert("Please define at least one nominal size row in the table.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        standard: formData.standard.trim().toUpperCase(),
        material_group: formData.material_group.trim(),
        material_grade: formData.material_grade.trim(),
        rating_class: formData.rating_class.trim(),
        design_code: formData.design_code.trim(),
        revision: formData.revision.trim(),
        roughness_mm: parseFloat(formData.roughness_mm) || 0.045,
        corrosion_allowance_mm: parseFloat(formData.corrosion_allowance_mm) || 0.0,
        min_temp_c: formData.min_temp_c !== '' && formData.min_temp_c !== null ? parseFloat(formData.min_temp_c) : null,
        max_temp_c: formData.max_temp_c !== '' && formData.max_temp_c !== null ? parseFloat(formData.max_temp_c) : null,
        sizes: formData.sizes.map(s => ({
          dn: parseInt(s.dn, 10),
          nps: String(s.nps),
          od_mm: parseFloat(s.od_mm),
          wt_mm: parseFloat(s.wt_mm),
          sch: s.sch || "STD",
          ca_mm: parseFloat(s.ca_mm || 0)
        })),
        temp_pressures: (formData.temp_pressures || []).map(tp => ({
          temp_c: parseFloat(tp.temp_c),
          press_bar: parseFloat(tp.press_bar)
        }))
      };

      if (isNewDraft) {
        const res = await axios.post('/api/pipe-classes', payload);
        setIsEditing(false);
        setIsNewDraft(false);
        setFormData(null);
        await fetchClasses();
        setSelectedClassId(res.data.id);
      } else {
        await axios.put(`/api/pipe-classes/${activeClass.id}`, payload);
        setIsEditing(false);
        setIsNewDraft(false);
        setFormData(null);
        await fetchClasses();
        setSelectedClassId(activeClass.id);
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        alert(err.response.data.detail);
      } else {
        alert("Failed to save pipe class.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClass = async (targetClass) => {
    if (!window.confirm(`Are you sure you want to delete pipe class '${targetClass.code}'?`)) return;
    try {
      await axios.delete(`/api/pipe-classes/${targetClass.id}`);
      setSelectedClassId(null);
      if (isEditing) handleCancelEdit();
      fetchClasses();
    } catch {
      alert("Failed to delete pipe class.");
    }
  };

  const handleSelectSidebarClass = (id) => {
    if (isEditing) {
      if (!window.confirm("You have unsaved changes. Discard changes and switch?")) return;
      handleCancelEdit();
    }
    setSelectedClassId(id);
  };

  // Form field mutators
  const updateFormField = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleAddSizeRow = () => {
    setFormData(prev => ({
      ...prev,
      sizes: [
        ...(prev.sizes || []),
        { dn: 150, nps: "6", od_mm: 168.3, wt_mm: 7.11, sch: "STD", ca_mm: 3.0 }
      ]
    }));
  };

  const handleRemoveSizeRow = (idx) => {
    setFormData(prev => ({
      ...prev,
      sizes: (prev.sizes || []).filter((_, i) => i !== idx)
    }));
  };

  const handleUpdateSizeRow = (idx, field, val) => {
    setFormData(prev => ({
      ...prev,
      sizes: (prev.sizes || []).map((row, i) => i === idx ? { ...row, [field]: val } : row)
    }));
  };

  const handleAddTempPressureRow = () => {
    setFormData(prev => ({
      ...prev,
      temp_pressures: [
        ...(prev.temp_pressures || []),
        { temp_c: 250.0, press_bar: 10.0 }
      ]
    }));
  };

  const handleRemoveTempPressureRow = (idx) => {
    setFormData(prev => ({
      ...prev,
      temp_pressures: (prev.temp_pressures || []).filter((_, i) => i !== idx)
    }));
  };

  const handleUpdateTempPressureRow = (idx, field, val) => {
    setFormData(prev => ({
      ...prev,
      temp_pressures: (prev.temp_pressures || []).map((row, i) => i === idx ? { ...row, [field]: parseFloat(val) || 0 } : row)
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', backgroundColor: 'var(--color-bg-canvas)', color: 'var(--color-text-primary)', overflow: 'hidden' }}>
      
      {/* Hidden File Input for Library Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        onChange={handleFileImport}
        style={{ display: 'none' }}
      />

      {/* Top Navbar Header */}
      <header style={{
        height: '56px',
        minHeight: '56px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        zIndex: 20,
        boxShadow: '0 1px 3px rgba(57, 82, 83, 0.05)'
      }}>
        {/* Left Side: Brand Logo, Version, and Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <img
              src={walflowLogo}
              alt="WälFlow Logo"
              onClick={() => onOpenHelpModal && onOpenHelpModal('about')}
              title="Click for Help & Documentation"
              style={{ height: '28px', display: 'block', cursor: 'pointer' }}
            />
            <span
              onClick={() => onOpenHelpModal && onOpenHelpModal('about')}
              title="Click for Help & Documentation"
              style={{
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--color-brand-dark)',
                cursor: 'pointer',
                userSelect: 'none',
                fontFamily: 'inherit',
                lineHeight: '1',
                marginBottom: '2px',
                whiteSpace: 'nowrap'
              }}
            >
              v{APP_VERSION} {RELEASE_STAGE ? `• ${RELEASE_STAGE}` : ''}
            </span>
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--color-border)' }} />

          <button
            onClick={() => {
              if (isEditing) {
                if (!window.confirm("You have unsaved changes. Discard and return to canvas?")) return;
              }
              onNavigateToCanvas();
            }}
            className="btn-secondary"
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: '700',
              gap: '6px'
            }}
          >
            ← Back to Diagram
          </button>

          {/* Navigation Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#F1F5F9',
            padding: '2px',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            marginLeft: '8px'
          }}>
            <button
              onClick={() => {
                if (isEditing && !window.confirm("You have unsaved changes. Discard?")) return;
                setIsEditing(false);
                setActiveTab('pipe_classes');
              }}
              style={{
                height: '28px',
                padding: '0 12px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'pipe_classes' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'pipe_classes' ? 'var(--color-brand-dark)' : 'var(--color-text-secondary)',
                boxShadow: activeTab === 'pipe_classes' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Pipe Specifications
            </button>
            <button
              onClick={() => {
                if (isEditing && !window.confirm("You have unsaved changes. Discard?")) return;
                setIsEditing(false);
                setActiveTab('fitting_standards');
              }}
              style={{
                height: '28px',
                padding: '0 12px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'fitting_standards' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'fitting_standards' ? 'var(--color-brand-dark)' : 'var(--color-text-secondary)',
                boxShadow: activeTab === 'fitting_standards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Fitting Standards & Schedules
            </button>
          </div>
        </div>

        {/* Right Side: Catalog Actions, Admin Hub, and User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeTab === 'pipe_classes' && (
            <>
              {canManage && (
                <button
                  onClick={handleSeedExamples}
                  disabled={isSeedingExamples || isEditing}
                  className="btn-secondary"
                  style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700' }}
                  title="Restore standard default example classes (CS01, SS01, LT01, DX01)"
                >
                  {isSeedingExamples ? 'Creating...' : 'Create Examples'}
                </button>
              )}

              <button
                onClick={handleExportLibrary}
                className="btn-secondary"
                style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700', gap: '4px' }}
                title="Export catalog as JSON file"
              >
                <ExportIcon size={12} />
                Export Library
              </button>

              {canManage && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isEditing}
                  className="btn-secondary"
                  style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700', gap: '4px' }}
                  title="Import specifications from JSON file"
                >
                  <ImportIcon size={12} />
                  Import Library
                </button>
              )}

              {canManage && (
                <>
                  <button
                    onClick={handleOpenTr2000Modal}
                    className="btn-secondary"
                    style={{
                      height: '32px',
                      padding: '0 12px',
                      fontSize: '11px',
                      fontWeight: '700',
                      gap: '4px'
                    }}
                    title="Search and import specs from Equinor TR2000 standard"
                  >
                    🌐 Import from TR2000
                  </button>

                  <button
                    onClick={handleStartNewClass}
                    className="btn-primary"
                    style={{
                      height: '32px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      gap: '6px'
                    }}
                  >
                    <PlusIcon size={12} color="#FFFFFF" />
                    New Pipe Class
                  </button>
                </>
              )}
            </>
          )}

          {isAdmin && (
            <button
              onClick={onOpenAdminHub}
              className="btn-secondary"
              style={{ height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: '700', gap: '4px' }}
            >
              <CrownIcon size={12} />
              Admin Hub
              {adminStatus?.pendingCount > 0 && (
                <span style={{
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: '10px',
                  fontWeight: '700',
                  marginLeft: '2px'
                }}>
                  {adminStatus.pendingCount}
                </span>
              )}
            </button>
          )}

          {/* User Auth Profile Box */}
          <div style={{
            height: '34px',
            padding: '0 12px',
            borderRadius: '8px',
            background: '#F4F7F6',
            border: '1px solid #D8E2E1',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxSizing: 'border-box'
          }}>
            {isAuthenticated ? (
              <>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  fontFamily: 'inherit',
                  color: isAdmin ? 'var(--color-primary)' : '#1C2B2C',
                  whiteSpace: 'nowrap'
                }}>
                  {currentUser?.username}
                </span>

                <button
                  onClick={() => logout()}
                  title="Sign Out"
                  className="btn-danger-ghost"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    height: '24px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    gap: '4px'
                  }}
                >
                  <SignOutIcon size={12} />
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="btn-secondary"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  padding: '0 6px',
                  gap: '4px'
                }}
              >
                <SignInIcon size={12} />
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area: Pipe Classes Catalog vs Fitting Standards & Schedules */}
      {activeTab === 'fitting_standards' ? (
        <FittingStandardsTab currentUser={currentUser} canManage={canManage} />
      ) : (
        <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

        
        {/* Left Sidebar: Catalog Listing */}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, name, grade..."
              className="form-input"
              style={{ width: '100%', height: '34px', fontSize: '12px' }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'WALFLOW_EXAMPLE', 'TR2000', 'CUSTOM'].map(st => (
                <button
                  key={st}
                  onClick={() => setStandardFilter(st)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '10px',
                    fontWeight: '700',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: standardFilter === st ? 'var(--color-brand-dark)' : 'var(--color-surface-light)',
                    color: standardFilter === st ? '#FFFFFF' : 'var(--color-text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {st === 'WALFLOW_EXAMPLE' ? 'Example' : st}
                </button>
              ))}
            </div>
          </div>

          {/* List of Specifications */}
          <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
            {/* If currently creating a new draft, show draft item at top */}
            {isNewDraft && formData && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  backgroundColor: 'rgba(250, 133, 7, 0.12)',
                  border: '1px solid var(--color-primary)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: 'var(--color-primary)' }}>
                    {formData.code || 'NEW_SPEC'} (Draft)
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: '700',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF'
                  }}>
                    DRAFT
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {formData.name || 'Unsaved new specification'}
                </div>
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: '20px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>Loading catalog...</div>}
            {error && <div style={{ color: 'var(--color-danger)', fontSize: '12px', padding: '10px' }}>{error}</div>}
            
            {!loading && filteredClasses.map(pc => {
              const isSelected = (!isNewDraft && activeClass?.id === pc.id);
              return (
                <div
                  key={pc.id}
                  onClick={() => handleSelectSidebarClass(pc.id)}
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
                    <span style={{ fontWeight: '800', fontSize: '13px', color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                      {pc.code}
                    </span>
                    <span style={{
                      fontSize: '9px',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: pc.is_builtin ? '#E2E8F0' : 'rgba(16, 185, 129, 0.15)',
                      color: pc.is_builtin ? '#475569' : '#059669'
                    }}>
                      {pc.standard === 'WALFLOW_EXAMPLE' ? 'EXAMPLE' : pc.standard}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pc.name}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>
                    {pc.rating_class} • {pc.material_group} • ε={pc.roughness_mm}mm
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Pane: Selected Pipe Class Details */}
        <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '24px', gap: '20px' }}>
          {currentSpec ? (
            <>
              {/* Header Spec Banner Card */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: isEditing ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                padding: '20px 24px',
                boxShadow: isEditing ? '0 0 0 3px rgba(250, 133, 7, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'border 0.2s, box-shadow 0.2s'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  
                  {isEditing ? (
                    /* Inline Editing Header Fields */
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '10px', fontWeight: '700', marginBottom: '2px' }}>Class Code *</label>
                          <input
                            type="text"
                            value={formData.code}
                            onChange={(e) => updateFormField('code', e.target.value)}
                            placeholder="e.g. CS02"
                            className="form-input"
                            style={{ width: '130px', fontWeight: '800', height: '34px' }}
                            required
                          />
                        </div>
                        <div style={{ flexGrow: 1 }}>
                          <label className="form-label" style={{ fontSize: '10px', fontWeight: '700', marginBottom: '2px' }}>Specification Name *</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => updateFormField('name', e.target.value)}
                            placeholder="e.g. High Pressure Carbon Steel 300#"
                            className="form-input"
                            style={{ width: '100%', fontWeight: '700', height: '34px' }}
                            required
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '10px', fontWeight: '700', marginBottom: '2px' }}>Standard Category</label>
                          <select
                            value={formData.standard}
                            onChange={(e) => updateFormField('standard', e.target.value)}
                            className="form-select"
                            style={{ height: '34px', fontSize: '11px', fontWeight: '700' }}
                          >
                            <option value="CUSTOM">CUSTOM</option>
                            <option value="ASME">ASME</option>
                            <option value="EN">EN</option>
                            <option value="DIN">DIN</option>
                            <option value="ISO">ISO</option>
                            <option value="TR2000">TR2000</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '10px', fontWeight: '700', marginBottom: '2px' }}>Design Standard / Code *</label>
                          <input
                            type="text"
                            value={formData.design_code}
                            onChange={(e) => updateFormField('design_code', e.target.value)}
                            placeholder="e.g. ASME B31.3"
                            className="form-input"
                            style={{ width: '200px', height: '30px', fontSize: '12px' }}
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '10px', fontWeight: '700', marginBottom: '2px' }}>Revision *</label>
                          <input
                            type="text"
                            value={formData.revision}
                            onChange={(e) => updateFormField('revision', e.target.value)}
                            placeholder="e.g. 1.0, Rev B"
                            className="form-input"
                            style={{ width: '110px', height: '30px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Read-Only Header View */
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                          {activeClass.code} — {activeClass.name}
                        </h2>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: activeClass.is_builtin ? '#F1F5F9' : 'rgba(16, 185, 129, 0.12)',
                          color: activeClass.is_builtin ? '#475569' : '#059669',
                          border: '1px solid var(--color-border)'
                        }}>
                          {activeClass.standard}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        Standard: <strong>{activeClass.design_code}</strong> • Revision: <strong>{activeClass.revision}</strong>
                      </p>
                    </div>
                  )}

                  {/* Top-Right Action Controls */}
                  {canManage && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="btn-secondary"
                            style={{ height: '34px', padding: '0 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}
                          >
                            Cancel / Discard
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="btn-primary"
                            style={{ height: '34px', padding: '0 18px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}
                          >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleCloneClass(activeClass)}
                            className="btn-secondary"
                            style={{ height: '32px', padding: '0 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}
                          >
                            Clone / Duplicate
                          </button>
                          <button
                            onClick={handleStartEdit}
                            className="btn-primary"
                            style={{ height: '32px', padding: '0 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}
                          >
                            Edit Spec
                          </button>
                          <button
                            onClick={() => handleDeleteClass(activeClass)}
                            className="btn-danger-ghost"
                            style={{ height: '32px', width: '32px', padding: 0, borderRadius: '6px' }}
                            title="Delete Class"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Key Properties Grid */}
                {isEditing ? (
                  /* Editable Properties Grid */
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px', fontWeight: '700' }}>Material Grade *</label>
                      <input
                        type="text"
                        value={formData.material_grade}
                        onChange={(e) => updateFormField('material_grade', e.target.value)}
                        placeholder="ASTM A106 Gr. B"
                        className="form-input"
                        style={{ height: '30px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px', fontWeight: '700' }}>Material Group</label>
                      <input
                        type="text"
                        value={formData.material_group}
                        onChange={(e) => updateFormField('material_group', e.target.value)}
                        placeholder="CS / SS / DX"
                        className="form-input"
                        style={{ height: '30px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px', fontWeight: '700' }}>Pressure Rating</label>
                      <input
                        type="text"
                        value={formData.rating_class}
                        onChange={(e) => updateFormField('rating_class', e.target.value)}
                        placeholder="CL150 / PN16"
                        className="form-input"
                        style={{ height: '30px', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px', fontWeight: '700' }}>Roughness (ε mm)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={formData.roughness_mm}
                        onChange={(e) => updateFormField('roughness_mm', e.target.value)}
                        className="form-input"
                        style={{ height: '30px', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                ) : (
                  /* Read-Only Properties Grid */
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '14px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Material Group & Grade</span>
                      <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px' }}>
                        {activeClass.material_group ? (
                          <span>
                            <span style={{ color: 'var(--color-brand-dark)', fontWeight: '800' }}>{activeClass.material_group}</span>
                            {activeClass.material_grade && (
                              <span style={{ color: 'var(--color-text-primary)' }}> • {activeClass.material_grade}</span>
                            )}
                          </span>
                        ) : (
                          activeClass.material_grade || '—'
                        )}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Pressure Rating</span>
                      <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px' }}>{activeClass.rating_class}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Surface Roughness (ε)</span>
                      <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px', color: 'var(--color-brand-dark)' }}>{activeClass.roughness_mm} mm</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontWeight: '700' }}>Design Temp Range</span>
                      <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px' }}>
                        {activeClass.min_temp_c !== null ? activeClass.min_temp_c : '—'}°C to {activeClass.max_temp_c !== null ? activeClass.max_temp_c : '—'}°C
                      </div>
                    </div>
                  </div>
                )}


              </div>

              {/* Data Grid of Supported Nominal Sizes */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                    Size Schedule Table ({currentSpec.sizes.length} Nominal Sizes)
                  </h3>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddSizeRow}
                      className="btn-secondary"
                      style={{ height: '28px', fontSize: '11px', fontWeight: '700', padding: '0 10px' }}
                    >
                      + Add Size Row
                    </button>
                  )}
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-surface-light)', borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Nominal Size (DN)</th>
                        <th style={{ padding: '8px 12px' }}>NPS (inches)</th>
                        <th style={{ padding: '8px 12px' }}>Outer Diameter (OD)</th>
                        <th style={{ padding: '8px 12px' }}>Wall Thickness (WT)</th>
                        <th style={{ padding: '8px 12px' }}>Schedule</th>
                        <th style={{ padding: '8px 12px' }}>Internal Diameter (ID)</th>
                        <th style={{ padding: '8px 12px' }}>Corrosion Allowance</th>
                        {isEditing && <th style={{ padding: '8px 12px', textAlign: 'center', width: '80px' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {isEditing ? (
                        /* Editable Size Rows */
                        formData.sizes.map((s, idx) => {
                          const od = parseFloat(s.od_mm) || 0;
                          const wt = parseFloat(s.wt_mm) || 0;
                          const calcId = Math.max(0, +(od - 2 * wt).toFixed(3));
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="number"
                                  value={s.dn}
                                  onChange={(e) => handleUpdateSizeRow(idx, 'dn', e.target.value)}
                                  className="form-input"
                                  style={{ width: '70px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={s.nps}
                                  onChange={(e) => handleUpdateSizeRow(idx, 'nps', e.target.value)}
                                  className="form-input"
                                  style={{ width: '60px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={s.od_mm}
                                  onChange={(e) => handleUpdateSizeRow(idx, 'od_mm', e.target.value)}
                                  className="form-input"
                                  style={{ width: '80px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={s.wt_mm}
                                  onChange={(e) => handleUpdateSizeRow(idx, 'wt_mm', e.target.value)}
                                  className="form-input"
                                  style={{ width: '80px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={s.sch}
                                  onChange={(e) => handleUpdateSizeRow(idx, 'sch', e.target.value)}
                                  className="form-input"
                                  style={{ width: '70px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', color: calcId > 0 ? 'var(--color-text-primary)' : 'var(--color-danger)', fontWeight: '600' }}>
                                {calcId} mm {isImperial && `(${(calcId / 25.4).toFixed(3)} in)`}
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={s.ca_mm}
                                  onChange={(e) => handleUpdateSizeRow(idx, 'ca_mm', e.target.value)}
                                  className="form-input"
                                  style={{ width: '70px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSizeRow(idx)}
                                  className="btn-danger-ghost"
                                  style={{ padding: '2px 8px', fontSize: '11px', height: '26px' }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        /* Read-Only Size Rows */
                        activeClass.sizes.map((s, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: '700' }}>DN {s.dn}</td>
                            <td style={{ padding: '10px 12px' }}>{s.nps}"</td>
                            <td style={{ padding: '10px 12px' }}>{s.od_mm} mm</td>
                            <td style={{ padding: '10px 12px' }}>{s.wt_mm} mm</td>
                            <td style={{ padding: '10px 12px' }}>{s.sch || 'STD'}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--color-text-primary)' }}>
                              {s.id_mm} mm {isImperial && `(${(s.id_mm / 25.4).toFixed(3)} in)`}
                            </td>
                            <td style={{ padding: '10px 12px' }}>{s.ca_mm || 0} mm</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Temperature - Pressure Ratings Table */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid var(--color-border)',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                    Temperature vs. Pressure (P-T) Ratings
                  </h3>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddTempPressureRow}
                      className="btn-secondary"
                      style={{ height: '28px', fontSize: '11px', fontWeight: '700', padding: '0 10px' }}
                    >
                      + Add P-T Rating Row
                    </button>
                  )}
                </div>

                {isEditing ? (
                  /* Editable P-T Table */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', maxWidth: '600px', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--color-surface-light)', borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>Temperature (°C)</th>
                          <th style={{ padding: '8px 12px' }}>Maximum Pressure (bar)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', width: '80px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(formData.temp_pressures || []).length === 0 ? (
                          <tr>
                            <td colSpan="3" style={{ padding: '14px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                              No P-T rating points specified.
                            </td>
                          </tr>
                        ) : (
                          formData.temp_pressures.map((tp, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '6px 12px' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={tp.temp_c}
                                  onChange={(e) => handleUpdateTempPressureRow(idx, 'temp_c', e.target.value)}
                                  className="form-input"
                                  style={{ width: '120px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 12px' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={tp.press_bar}
                                  onChange={(e) => handleUpdateTempPressureRow(idx, 'press_bar', e.target.value)}
                                  className="form-input"
                                  style={{ width: '120px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTempPressureRow(idx)}
                                  className="btn-danger-ghost"
                                  style={{ padding: '2px 8px', fontSize: '11px', height: '26px' }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Read-Only P-T Badges */
                  activeClass.temp_pressures && activeClass.temp_pressures.length > 0 ? (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {activeClass.temp_pressures.map((tp, idx) => (
                        <div key={idx} style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: 'var(--color-surface-light)', border: '1px solid var(--color-border)', minWidth: '120px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '700' }}>{tp.temp_c}°C</div>
                          <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-brand-dark)', marginTop: '2px' }}>{tp.press_bar} bar</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      No P-T rating points defined for this specification.
                    </div>
                  )
                )}
              </div>

            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
              Select a pipe specification from the left sidebar to view details.
            </div>
          )}
        </main>
      </div>
      )}


      {/* NEW PIPE CLASS MINI-DIALOG */}
      {isNewClassModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 133, 7, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary)'
                }}>
                  <PlusIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>New Pipe Class</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Enter initial identification to begin editing on page
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewClassModalOpen(false)} className="modal-close-btn">
                <CrossIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmNewClass} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '11px', fontWeight: '700' }}>Class Code *</label>
                <input
                  type="text"
                  value={newClassCode}
                  onChange={(e) => setNewClassCode(e.target.value)}
                  placeholder="e.g. CS02, SS02, DX02"
                  className="form-input"
                  style={{ width: '100%', height: '36px', fontWeight: '700' }}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '11px', fontWeight: '700' }}>Class Name *</label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="e.g. High Pressure Carbon Steel 300#"
                  className="form-input"
                  style={{ width: '100%', height: '36px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setIsNewClassModalOpen(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '0 16px', height: '34px', fontSize: '12px', fontWeight: '700' }}>
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EQUINOR TR2000 IMPORTER MODAL */}
      {isTr2000ModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '800px', maxHeight: '90vh' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(250, 133, 7, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px'
                }}>
                  🌐
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '16px' }}>Import Equinor TR2000 Specification</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Fetch piping classes from Equinor's REST API into WalFlow
                  </p>
                </div>
              </div>
              <button onClick={() => setIsTr2000ModalOpen(false)} className="modal-close-btn"><CrossIcon size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {tr2000Error && (
                <div style={{ color: 'var(--color-danger)', fontSize: '12px', padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid var(--color-danger)' }}>
                  {tr2000Error}
                </div>
              )}

              {/* Plant selector and Search Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '11px', fontWeight: '700' }}>PCS Library / Plant</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '36px', fontSize: '12px' }}
                    value={selectedPlantId}
                    onChange={(e) => handlePlantChange(e.target.value)}
                  >
                    {tr2000Plants.map(p => (
                      <option key={p.PlantID} value={p.PlantID}>
                        {p.PlantCode} — {p.PlantName || `Plant ${p.PlantID}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '11px', fontWeight: '700' }}>Filter Specification Code</label>
                  <form onSubmit={handleSearchTr2000Submit} style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={tr2000SearchQuery}
                      onChange={(e) => setTr2000SearchQuery(e.target.value)}
                      placeholder="e.g. AC140, AC111, DX, CL300..."
                      className="form-input"
                      style={{ flexGrow: 1, height: '36px', fontSize: '12px' }}
                    />
                    <button type="submit" disabled={isSearchingTr2000} className="btn-secondary" style={{ height: '36px', padding: '0 14px', fontSize: '11px', fontWeight: '700' }}>
                      {isSearchingTr2000 ? 'Searching...' : 'Filter'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Legal & Terms and Conditions Agreement Box */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-surface-light)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="equinorTermsCheckbox"
                  checked={agreedToEquinorTerms}
                  onChange={(e) => setAgreedToEquinorTerms(e.target.checked)}
                  style={{ marginTop: '3px', cursor: 'pointer' }}
                />
                <label htmlFor="equinorTermsCheckbox" style={{ fontSize: '11px', color: 'var(--color-text-primary)', cursor: 'pointer', lineHeight: '1.4' }}>
                  <strong>Equinor Terms & Conditions Acceptance:</strong> I acknowledge that TR2000 piping specifications are owned by Equinor. I have reviewed and agree to the{' '}
                  <a
                    href="https://www.equinor.com/about-us/terms-and-conditions"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--color-primary)', fontWeight: '700', textDecoration: 'underline' }}
                  >
                    Equinor Terms and Conditions
                  </a>
                  {' '}for downloading, referencing, and maintaining these engineering specifications.
                </label>
              </div>

              {/* Results List Header with Quick Select Actions */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Available Specifications ({tr2000Results.length} found)
                    </h4>
                    {selectedTr2000Codes.size > 0 && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: 'var(--color-brand-dark)',
                        color: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {selectedTr2000Codes.size} selected
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAllTr2000}
                      disabled={tr2000Results.length === 0 || isSyncingTr2000}
                      className="btn-secondary"
                      style={{ height: '26px', padding: '0 10px', fontSize: '11px', fontWeight: '600' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleUnselectAllTr2000}
                      disabled={selectedTr2000Codes.size === 0 || isSyncingTr2000}
                      className="btn-secondary"
                      style={{ height: '26px', padding: '0 10px', fontSize: '11px', fontWeight: '600' }}
                    >
                      Unselect All
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: '#FFFFFF' }}>
                  {isSearchingTr2000 ? (
                    <div style={{ textAlign: 'center', padding: '30px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      Querying TR2000 API...
                    </div>
                  ) : tr2000Results.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      No specifications found for the current query in this plant.
                    </div>
                  ) : (
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{ textAlign: 'left' }}>
                          <th style={{
                            width: '36px',
                            padding: '10px',
                            backgroundColor: '#F4F7F6',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            borderBottom: '1px solid var(--color-border)',
                            boxShadow: '0 1px 0 var(--color-border)',
                            textAlign: 'center'
                          }}>
                            <input
                              type="checkbox"
                              checked={isAllVisibleSelected}
                              onChange={handleToggleMasterCheckbox}
                              style={{ cursor: 'pointer' }}
                              title="Select / Unselect All"
                            />
                          </th>
                          <th style={{
                            padding: '10px',
                            backgroundColor: '#F4F7F6',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            borderBottom: '1px solid var(--color-border)',
                            boxShadow: '0 1px 0 var(--color-border)',
                            color: 'var(--color-text-primary)'
                          }}>
                            PCS Code
                          </th>
                          <th style={{
                            padding: '10px',
                            backgroundColor: '#F4F7F6',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            borderBottom: '1px solid var(--color-border)',
                            boxShadow: '0 1px 0 var(--color-border)',
                            color: 'var(--color-text-primary)'
                          }}>
                            Description
                          </th>
                          <th style={{
                            padding: '10px',
                            backgroundColor: '#F4F7F6',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            borderBottom: '1px solid var(--color-border)',
                            boxShadow: '0 1px 0 var(--color-border)',
                            color: 'var(--color-text-primary)'
                          }}>
                            Rating
                          </th>
                          <th style={{
                            padding: '10px',
                            backgroundColor: '#F4F7F6',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            borderBottom: '1px solid var(--color-border)',
                            boxShadow: '0 1px 0 var(--color-border)',
                            color: 'var(--color-text-primary)'
                          }}>
                            Material
                          </th>
                          <th style={{
                            padding: '10px',
                            backgroundColor: '#F4F7F6',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                            borderBottom: '1px solid var(--color-border)',
                            boxShadow: '0 1px 0 var(--color-border)',
                            color: 'var(--color-text-primary)'
                          }}>
                            Rev
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tr2000Results.map((item, idx) => {
                          const code = item.PcsCode || item.Code || item.pcs_code || item.PCS;
                          const rev = item.RevID || item.Revision || 'A';
                          const isSelected = selectedTr2000Codes.has(code);

                          return (
                            <tr
                              key={idx}
                              onClick={() => handleToggleSelectTr2000Spec(code)}
                              style={{
                                borderBottom: '1px solid var(--color-border)',
                                backgroundColor: isSelected ? 'rgba(250, 133, 7, 0.07)' : 'transparent',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease'
                              }}
                            >
                              <td style={{ padding: '8px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectTr2000Spec(code)}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--color-primary)' }}>{code}</td>
                              <td style={{ padding: '8px 10px' }}>{item.Description || item.description || '—'}</td>
                              <td style={{ padding: '8px 10px' }}>{item.RatingClass || item.rating_class || '—'}</td>
                              <td style={{ padding: '8px 10px' }}>{item.MaterialGroup || item.MaterialGrade || item.material_group || '—'}</td>
                              <td style={{ padding: '8px 10px' }}>{rev}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Modal Footer with Batch Import Action and Progress */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                <div>
                  {batchSyncProgress ? (
                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-primary)' }}>
                      ⏳ Importing {batchSyncProgress.current} of {batchSyncProgress.total}: [{batchSyncProgress.currentCode}]...
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      {selectedTr2000Codes.size} specification{selectedTr2000Codes.size === 1 ? '' : 's'} selected for download.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsTr2000ModalOpen(false)}
                    disabled={isSyncingTr2000}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleStartBatchImport}
                    disabled={!agreedToEquinorTerms || selectedTr2000Codes.size === 0 || isSyncingTr2000}
                    className="btn-primary"
                    style={{
                      height: '36px',
                      padding: '0 20px',
                      fontSize: '12px',
                      fontWeight: '700',
                      opacity: (!agreedToEquinorTerms || selectedTr2000Codes.size === 0) ? 0.5 : 1
                    }}
                  >
                    {isSyncingTr2000
                      ? `Importing (${batchSyncProgress?.current || 0}/${batchSyncProgress?.total || selectedTr2000Codes.size})...`
                      : `Import Selected (${selectedTr2000Codes.size})`
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE SPECIFICATION CONFLICT RESOLUTION MODAL */}
      {isConflictModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 20000 }}>
          <div className="modal-container" style={{ maxWidth: '600px' }}>

            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 133, 7, 0.12)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px'
                }}>
                  ⚠️
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>Duplicate Specifications Detected</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {conflictList.length} of your selected specification(s) already exist in your local library.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsConflictModalOpen(false)} className="modal-close-btn"><CrossIcon size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                  Set Action for All Conflicts:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleSetAllConflictActions('update')}
                    className="btn-secondary"
                    style={{ height: '24px', padding: '0 8px', fontSize: '10px', fontWeight: '700' }}
                  >
                    Set All to Update
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllConflictActions('copy')}
                    className="btn-secondary"
                    style={{ height: '24px', padding: '0 8px', fontSize: '10px', fontWeight: '700' }}
                  >
                    Set All to Copy (1)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllConflictActions('skip')}
                    className="btn-secondary"
                    style={{ height: '24px', padding: '0 8px', fontSize: '10px', fontWeight: '700' }}
                  >
                    Set All to Skip
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F4F7F6', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '8px 10px' }}>PCS Code</th>
                      <th style={{ padding: '8px 10px' }}>Description</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Resolution Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflictList.map((item) => (
                      <tr key={item.code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--color-primary)' }}>{item.code}</td>
                        <td style={{ padding: '8px 10px' }}>{item.description}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '3px', backgroundColor: 'var(--color-surface)', padding: '2px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleConflictAction(item.code, 'update')}
                              style={{
                                padding: '2px 8px',
                                fontSize: '10px',
                                fontWeight: '700',
                                borderRadius: '3px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: item.action === 'update' ? 'var(--color-brand-dark)' : 'transparent',
                                color: item.action === 'update' ? '#ffffff' : 'var(--color-text-secondary)'
                              }}
                              title="Overwrite/Update existing local specification"
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleConflictAction(item.code, 'copy')}
                              style={{
                                padding: '2px 8px',
                                fontSize: '10px',
                                fontWeight: '700',
                                borderRadius: '3px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: item.action === 'copy' ? 'var(--color-brand-dark)' : 'transparent',
                                color: item.action === 'copy' ? '#ffffff' : 'var(--color-text-secondary)'
                              }}
                              title="Import as copy with (1) suffix"
                            >
                              Copy (1)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleConflictAction(item.code, 'skip')}
                              style={{
                                padding: '2px 8px',
                                fontSize: '10px',
                                fontWeight: '700',
                                borderRadius: '3px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: item.action === 'skip' ? 'var(--color-brand-dark)' : 'transparent',
                                color: item.action === 'skip' ? '#ffffff' : 'var(--color-text-secondary)'
                              }}
                              title="Skip importing this specification"
                            >
                              Skip
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsConflictModalOpen(false)}
                  className="btn-secondary"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Abort Import
                </button>

                <button
                  type="button"
                  onClick={() => executeBatchImport([...nonConflictList, ...conflictList])}
                  className="btn-primary"
                  style={{ height: '34px', padding: '0 16px', fontWeight: '700' }}
                >
                  Proceed with Import ({nonConflictList.length + conflictList.filter(c => c.action !== 'skip').length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIBRARY IMPORT REPORT MODAL */}

      {isImportReportModalOpen && importReport && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(57, 82, 83, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-brand-dark)'
                }}>
                  <ImportIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>Catalog Import Summary</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Results from importing piping specifications JSON
                  </p>
                </div>
              </div>
              <button onClick={() => setIsImportReportModalOpen(false)} className="modal-close-btn">
                <CrossIcon size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Successfully Imported */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '18px' }}>✅</span>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '12px', color: '#065F46' }}>
                    {importReport.imported_count} specifications successfully imported
                  </div>
                  {importReport.imported?.length > 0 && (
                    <div style={{ fontSize: '11px', color: '#047857', marginTop: '2px' }}>
                      Codes: {importReport.imported.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Skipped Duplicates */}
              {importReport.skipped_duplicates?.length > 0 && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span>
                    <strong style={{ fontSize: '12px', color: '#92400E' }}>
                      {importReport.skipped_duplicates.length} duplicate specifications were skipped (not imported):
                    </strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {importReport.skipped_duplicates.map((code, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#FEF3C7',
                          color: '#92400E',
                          fontWeight: '700',
                          fontSize: '11px',
                          border: '1px solid #FCD34D'
                        }}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#B45309' }}>
                    Existing classes with matching codes were preserved to prevent accidental overwriting.
                  </p>
                </div>
              )}

              {/* Invalid Entries */}
              {importReport.invalid_entries?.length > 0 && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <strong style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
                    {importReport.invalid_entries.length} entries could not be parsed:
                  </strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '11px', color: 'var(--color-danger)' }}>
                    {importReport.invalid_entries.map((inv, idx) => (
                      <li key={idx}>{inv.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setIsImportReportModalOpen(false)}
                  className="btn-primary"
                  style={{ padding: '0 18px', height: '34px', fontSize: '12px', fontWeight: '700' }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PipeClassesPage;
