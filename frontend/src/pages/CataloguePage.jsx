import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { notify, confirmDialog, confirmDiscard } from '../utils/dialogs';
import axios from 'axios';
import walflowLogo from '../assets/Logo_WalFlow.svg';
import { useAuth } from '../hooks/useAuth';
import { useUnits } from '../context/UnitContext';
import { APP_VERSION, RELEASE_STAGE } from '../constants';
import { 
  PlusIcon, 
  TrashIcon, 
  CrossIcon, 
  ImportIcon, 
  CrownIcon, 
  SignOutIcon, 
  SignInIcon,
  GlobeIcon,
  WarningIcon,
  CheckCircleIcon,
  SpinnerIcon,
  ArrowLeftIcon,
  RulerIcon,
  ClipboardIcon,
  CopyIcon,
  EditIcon
} from '../components/symbols/IconLibrary';
import FittingStandardsTab from '../components/piping/FittingStandardsTab';
import LibraryActions, { DetailToolbar } from '../components/piping/LibraryActions';
import { useFittingStandards } from '../hooks/useFittingStandards';
import {
  getScheduleStandardOptions,
  getScheduleBore,
  getScheduleStandardName,
  classScheduleChoices,
  classScheduleCodes,
  classReducerCodes,
  catalogDns,
  defaultScheduleFor,
  scheduleLabel,
  DEFAULT_SCHEDULE_STANDARD
} from '../utils/pipe_schedules';
import { getReducerStandardOptions, DEFAULT_REDUCER_STANDARD } from '../utils/reducer_catalog';
import { specUnits } from '../utils/specUnits';
import DraftNumberInput from '../components/common/DraftNumberInput';

import { modalA11yRef } from '../hooks/useModalA11y';
import { clickableProps, clickableRowProps } from '../utils/a11yProps';

// Readable names for internal catalogue identifiers. The raw code stays available as a tooltip.
const SOURCE_LABELS = { ALL: 'All', WALFLOW_EXAMPLE: 'Example', TR2000: 'TR2000', CUSTOM: 'Custom' };
const sourceLabel = (code) => SOURCE_LABELS[code] || code;
// Catalog names come from the fitting catalog (database); the code shows while it is not loaded
const catalogName = (code, options) => options.find(o => o.code === code)?.name || code;
const CataloguePage = ({ onNavigateToCanvas, onOpenAuthModal, onOpenAdminHub, onOpenHelpModal }) => {
  const { currentUser, isAuthenticated, isAdmin, adminStatus, logout } = useAuth();
  const { isImperial } = useUnits();

  const [activeTab, setActiveTab] = useState('pipe_classes'); // 'pipe_classes' | 'fitting_standards' | 'control_valves'
  const scheduleStandardOptions = getScheduleStandardOptions(useFittingStandards('pipe_schedule'));
  const reducerStandardOptions = getReducerStandardOptions(useFittingStandards('reducer'));
  const units = specUnits(isImperial);
  // The fitting standards tab reports unsaved edits so tab switches can ask before discarding
  const [isFittingDirty, setIsFittingDirty] = useState(false);
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
  const hasUnsavedEdit = isEditing || isFittingDirty;

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
      setError('Failed to fetch the pipe classes.');
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
      notify(res.data.message || `Created ${res.data.created_count} example pipe classes.`, 'success');
      fetchClasses();
    } catch {
      notify('Failed to restore the example pipe classes.', 'error');
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
      notify('Failed to export pipe classes library.', 'error');
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
        notify(err.response?.data?.detail || 'Failed to parse or import JSON file. Please check file format.', 'error');
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
      setTr2000Error('Failed to query pipe classes from the TR2000 API.');
    } finally {
      setIsSearchingTr2000(false);
    }
  };

  const handleOpenTr2000Modal = async () => {
    if (isEditing) {
      if (!(await confirmDiscard('import from TR2000'))) return;
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
      notify("You must review and agree to Equinor's Terms and Conditions before downloading TR2000 pipe classes.", 'warning');
      return;
    }
    if (selectedTr2000Codes.size === 0) {
      notify("Please select at least one pipe class to import.", 'warning');
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
      setTr2000Error(`Imported ${successCount} pipe classes. ${errors.length} failed: ${errors.join(', ')}`);
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
      reducer_standard_codes: [...classReducerCodes(activeClass)],
      schedule_standard_codes: [...classScheduleCodes(activeClass)],
      sizes: activeClass.sizes.map(s => ({ ...s })),
      temp_pressures: (activeClass.temp_pressures || []).map(tp => ({ ...tp }))
    });
  };

  const handleStartNewClass = async () => {
    if (isEditing) {
      if (!(await confirmDiscard('create a new pipe class'))) return;
      handleCancelEdit();
    }
    setNewClassCode('CS02');
    setNewClassName('');
    setIsNewClassModalOpen(true);
  };

  const handleConfirmNewClass = (e) => {
    e.preventDefault();
    if (!newClassCode.trim() || !newClassName.trim()) {
      notify("Please fill in both Class Code and Class Name.", 'warning');
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
      reducer_standard_codes: [DEFAULT_REDUCER_STANDARD],
      schedule_standard_codes: [DEFAULT_SCHEDULE_STANDARD],
      revision: '1.0',
      roughness_mm: 0.045,
      corrosion_allowance_mm: 3.0,
      min_temp_c: -29,
      max_temp_c: 200,
      sizes: [
        { dn: 50, catalog: DEFAULT_SCHEDULE_STANDARD, sch: 'STD', ca_mm: 3.0 }
      ],
      temp_pressures: [
        { temp_c: 20.0, press_bar: 19.6 }
      ]
    });
  };

  const handleCloneClass = async (source) => {
    if (isEditing) {
      if (!(await confirmDiscard('clone this pipe class'))) return;
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
      reducer_standard_codes: [...classReducerCodes(source)],
      schedule_standard_codes: [...classScheduleCodes(source)],
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
      notify("Please fill in required Class Code and Class Name.", 'warning');
      return;
    }
    if (!formData.sizes || formData.sizes.length === 0) {
      notify("Please define at least one nominal size row in the table.", 'warning');
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
        reducer_standard_codes: formData.reducer_standard_codes,
        schedule_standard_codes: formData.schedule_standard_codes,
        revision: formData.revision.trim(),
        roughness_mm: parseFloat(formData.roughness_mm) || 0.045,
        corrosion_allowance_mm: parseFloat(formData.corrosion_allowance_mm) || 0.0,
        min_temp_c: formData.min_temp_c !== '' && formData.min_temp_c !== null ? parseFloat(formData.min_temp_c) : null,
        max_temp_c: formData.max_temp_c !== '' && formData.max_temp_c !== null ? parseFloat(formData.max_temp_c) : null,
        // Catalog sizes are saved as references; only custom sizes carry their own dimensions
        sizes: formData.sizes.map(s => (s.custom ? {
          dn: parseInt(s.dn, 10),
          custom: true,
          nps: String(s.nps ?? ''),
          od_mm: parseFloat(s.od_mm),
          wt_mm: parseFloat(s.wt_mm),
          sch: s.sch || '',
          ca_mm: parseFloat(s.ca_mm || 0)
        } : {
          dn: parseInt(s.dn, 10),
          catalog: s.catalog,
          sch: s.sch,
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
        notify(err.response.data.detail, 'warning');
      } else {
        notify("Failed to save pipe class.", 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClass = async (targetClass) => {
    const ok = await confirmDialog({
      title: 'Delete pipe class?',
      message: `Delete pipe class '${targetClass.code}'?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`/api/pipe-classes/${targetClass.id}`);
      setSelectedClassId(null);
      if (isEditing) handleCancelEdit();
      fetchClasses();
    } catch {
      notify("Failed to delete pipe class.", 'error');
    }
  };

  const handleSelectSidebarClass = async (id) => {
    if (isEditing) {
      if (!(await confirmDiscard('switch'))) return;
      handleCancelEdit();
    }
    setSelectedClassId(id);
  };

  // Form field mutators
  const updateFormField = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  // Catalog dimensions of a size row (references are looked up, custom rows carry their own)
  const rowDimensions = (row) => {
    if (row.custom) return { nps: row.nps, od_mm: row.od_mm, wt_mm: row.wt_mm };
    const bore = getScheduleBore(row.dn, row.sch, row.catalog, scheduleStandardOptions);
    return bore ? { nps: bore.nps, od_mm: bore.od_mm, wt_mm: bore.wt_mm } : null;
  };

  // Catalog and schedule for a DN among the class's catalogs: keep the current pair when listed,
  // else the default wall of the first catalog listing the DN
  const preferredReference = (dn, codes, current = {}) => {
    const groups = classScheduleChoices(dn, codes, scheduleStandardOptions);
    const same = groups.find(g => g.code === current.catalog && g.schedules.includes(current.sch));
    if (same) return { catalog: same.code, sch: current.sch };
    const sameSch = groups.find(g => g.schedules.includes(current.sch));
    if (sameSch) return { catalog: sameSch.code, sch: current.sch };
    if (!groups.length) return null;
    const fallback = defaultScheduleFor(groups[0].code);
    return { catalog: groups[0].code, sch: groups[0].schedules.includes(fallback) ? fallback : groups[0].schedules[0] };
  };

  const handleAddSizeRow = () => {
    setFormData(prev => {
      const codes = prev.schedule_standard_codes || [];
      const used = new Set((prev.sizes || []).map(s => Number(s.dn)));
      const dn = catalogDns(codes, scheduleStandardOptions).find(d => !used.has(d));
      const ref = dn !== undefined ? preferredReference(dn, codes) : null;
      const ca = parseFloat(prev.corrosion_allowance_mm) || 0;
      const row = ref ? { dn, ...ref, ca_mm: ca } : { dn: '', nps: '', od_mm: '', wt_mm: '', sch: '', ca_mm: ca, custom: true };
      return { ...prev, sizes: [...(prev.sizes || []), row] };
    });
  };

  // A catalog DN was picked: keep the schedule when listed for it. 'custom' keeps the current dimensions as a custom size.
  const handlePickSizeDn = (idx, value) => {
    setFormData(prev => ({
      ...prev,
      sizes: (prev.sizes || []).map((row, i) => {
        if (i !== idx) return row;
        if (value === 'custom') {
          const dims = rowDimensions(row) || {};
          return { dn: row.dn, nps: dims.nps ?? '', od_mm: dims.od_mm ?? '', wt_mm: dims.wt_mm ?? '', sch: row.sch || '', ca_mm: row.ca_mm, custom: true };
        }
        const dn = Number(value);
        const ref = preferredReference(dn, prev.schedule_standard_codes || [], row);
        return ref ? { dn, ...ref, ca_mm: row.ca_mm } : row;
      })
    }));
  };

  // Schedule select values are `catalog|sch`, so the same designation in two catalogs stays distinct
  const handlePickSchedule = (idx, value) => {
    const [catalog, ...rest] = value.split('|');
    const sch = rest.join('|');
    setFormData(prev => ({
      ...prev,
      sizes: (prev.sizes || []).map((row, i) => (i === idx ? { dn: row.dn, catalog, sch, ca_mm: row.ca_mm } : row))
    }));
  };

  // Catalog checkboxes. A schedule catalog that size rows use cannot be removed; one catalog stays selected.
  const handleToggleCatalog = (field, code) => {
    const current = formData[field] || [];
    if (!current.includes(code)) {
      updateFormField(field, [...current, code]);
      return;
    }
    if (current.length === 1) {
      notify('A pipe class needs at least one catalog.', 'warning');
      return;
    }
    if (field === 'schedule_standard_codes') {
      const inUse = (formData.sizes || []).filter(s => !s.custom && s.catalog === code).map(s => `DN${s.dn}`);
      if (inUse.length) {
        notify(`${getScheduleStandardName(code, scheduleStandardOptions)} is used by ${inUse.join(', ')}. Change those sizes first.`, 'warning');
        return;
      }
    }
    updateFormField(field, current.filter(c => c !== code));
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
    setFormData(prev => {
      const points = prev.temp_pressures || [];
      const last = points[points.length - 1];
      // Next point 50 degC above the last one, same pressure until edited
      const next = last ? { temp_c: Number(last.temp_c) + 50, press_bar: Number(last.press_bar) } : { temp_c: 38, press_bar: 0 };
      return { ...prev, temp_pressures: [...points, next] };
    });
  };

  const handleRemoveTempPressureRow = (idx) => {
    setFormData(prev => ({
      ...prev,
      temp_pressures: (prev.temp_pressures || []).filter((_, i) => i !== idx)
    }));
  };

  // Committed on blur (DraftNumberInput) so negative temperatures can be typed; text that is not a number is ignored
  const handleUpdateTempPressureRow = (idx, field, val) => {
    if (val === null) return;
    setFormData(prev => ({
      ...prev,
      temp_pressures: (prev.temp_pressures || []).map((row, i) => i === idx ? { ...row, [field]: val } : row)
    }));
  };

  const libraryActions = (
    <LibraryActions
      canManage={canManage}
      newLabel="New pipe class"
      onNew={handleStartNewClass}
      onImportTr2000={handleOpenTr2000Modal}
      onImport={() => fileInputRef.current?.click()}
      importTitle="Import pipe classes from a JSON file"
      onExport={handleExportLibrary}
      exportTitle="Export all pipe classes as a JSON file"
      onRestore={handleSeedExamples}
      restoreTitle="Restore the example pipe classes (CS01, SS01, LT01, DX01)"
      isRestoring={isSeedingExamples}
    />
  );

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
            <span {...clickableProps}
              onClick={() => onOpenHelpModal && onOpenHelpModal('about')}
              title="Click for Help & Documentation"
              style={{
                fontSize: 'var(--fs-xs)',
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
            onClick={async () => {
              if (hasUnsavedEdit) {
                if (!(await confirmDiscard('return to the canvas'))) return;
              }
              onNavigateToCanvas();
            }}
            className="btn-secondary"
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: 'var(--fs-sm)',
              fontWeight: '700',
              gap: '6px'
            }}
          >
            <ArrowLeftIcon size={14} /> Back to drawing
          </button>

          {/* Navigation Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--color-surface-hover)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--color-border)',
            marginLeft: '8px',
            gap: '2px'
          }}>
            <button
              onClick={async () => {
                if (activeTab === 'pipe_classes') return;
                if (hasUnsavedEdit && !(await confirmDiscard('switch tabs'))) return;
                handleCancelEdit();
                setActiveTab('pipe_classes');
              }}
              style={{
                height: '28px',
                padding: '0 12px',
                fontSize: 'var(--fs-sm)',
                fontWeight: '600',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'pipe_classes' ? 'var(--color-brand-dark)' : 'transparent',
                color: activeTab === 'pipe_classes' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                boxShadow: activeTab === 'pipe_classes' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Pipe classes
            </button>
            <button
              onClick={async () => {
                if (activeTab === 'fitting_standards') return;
                if (hasUnsavedEdit && !(await confirmDiscard('switch tabs'))) return;
                handleCancelEdit();
                setActiveTab('fitting_standards');
              }}
              style={{
                height: '28px',
                padding: '0 12px',
                fontSize: 'var(--fs-sm)',
                fontWeight: '600',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'fitting_standards' ? 'var(--color-brand-dark)' : 'transparent',
                color: activeTab === 'fitting_standards' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                boxShadow: activeTab === 'fitting_standards' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Fitting standards and schedules
            </button>
            <button
              onClick={async () => {
                if (activeTab === 'control_valves') return;
                if (hasUnsavedEdit && !(await confirmDiscard('switch tabs'))) return;
                handleCancelEdit();
                setActiveTab('control_valves');
              }}
              style={{
                height: '28px',
                padding: '0 12px',
                fontSize: 'var(--fs-sm)',
                fontWeight: '600',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === 'control_valves' ? 'var(--color-brand-dark)' : 'transparent',
                color: activeTab === 'control_valves' ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                boxShadow: activeTab === 'control_valves' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Control valve styles
            </button>
          </div>
        </div>

        {/* Right Side: Catalog Actions, Admin Hub, and User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin && (
            <button
              onClick={onOpenAdminHub}
              className="btn-secondary"
              style={{ height: '32px', padding: '0 10px', fontSize: 'var(--fs-xs)', fontWeight: '700', gap: '4px' }}
            >
              <CrownIcon size={12} />
              Admin Hub
              {adminStatus?.pendingCount > 0 && (
                <span aria-label={`${adminStatus.pendingCount} pending registration requests`} style={{
                  backgroundColor: 'var(--color-danger)',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontSize: 'var(--fs-xs)',
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
                  fontSize: 'var(--fs-sm)',
                  fontWeight: '600',
                  fontFamily: 'inherit',
                  color: '#1C2B2C',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {isAdmin && <CrownIcon size={12} color="var(--color-text-secondary)" aria-label="Administrator" />}
                  {currentUser?.username}
                </span>

                <button
                  onClick={() => logout()}
                  title="Sign out"
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
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="btn-secondary"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary-text)',
                  padding: '0 6px',
                  gap: '4px'
                }}
              >
                <SignInIcon size={12} />
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area: Pipe Classes Catalog vs Fitting Standards & Schedules */}
      {activeTab === 'fitting_standards' ? (
        <FittingStandardsTab key="fittings" currentUser={currentUser} canManage={canManage} onDirtyChange={setIsFittingDirty} />
      ) : activeTab === 'control_valves' ? (
        <FittingStandardsTab key="control_valves" fittingType="control_valve" currentUser={currentUser} canManage={canManage} onDirtyChange={setIsFittingDirty} />
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
              style={{ width: '100%', height: '34px', fontSize: 'var(--fs-sm)' }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'WALFLOW_EXAMPLE', 'TR2000', 'CUSTOM'].map(st => (
                <button
                  key={st}
                  onClick={() => setStandardFilter(st)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: 'var(--fs-xs)',
                    fontWeight: '600',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: standardFilter === st ? 'var(--color-brand-dark)' : 'var(--color-surface-light)',
                    color: standardFilter === st ? '#FFFFFF' : 'var(--color-text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {sourceLabel(st)}
                </button>
              ))}
            </div>
          </div>

          {/* List of pipe classes */}
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
                  <span style={{ fontWeight: '800', fontSize: 'var(--fs-base)', color: 'var(--color-primary-text)' }}>
                    {formData.code || 'NEW_SPEC'} (Draft)
                  </span>
                  <span style={{
                    fontSize: 'var(--fs-xs)',
                    fontWeight: '700',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-text-primary)'
                  }}>
                    DRAFT
                  </span>
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {formData.name || 'Unsaved new pipe class'}
                </div>
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: '20px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>Loading catalog...</div>}
            {error && <div style={{ color: 'var(--color-danger-text)', fontSize: 'var(--fs-sm)', padding: '10px' }}>{error}</div>}
            
            {!loading && filteredClasses.map(pc => {
              const isSelected = (!isNewDraft && activeClass?.id === pc.id);
              return (
                <div {...clickableProps}
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
                    <span style={{ fontWeight: '800', fontSize: 'var(--fs-base)', color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                      {pc.code}
                    </span>
                    <span title={pc.standard} style={{
                      fontSize: 'var(--fs-xs)',
                      fontWeight: '600',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: pc.is_builtin ? '#E2E8F0' : 'rgba(16, 185, 129, 0.15)',
                      color: pc.is_builtin ? 'var(--color-text-secondary)' : '#059669'
                    }}>
                      {sourceLabel(pc.standard)}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pc.name}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
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
              <details
                data-testid="pipe-class-explainer"
                style={{ backgroundColor: '#F4F7F6', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '10px 16px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--color-brand-dark)' }}>What is a pipe class, and what does the solver use?</summary>
                <div style={{ marginTop: '8px' }}>
                  <p style={{ margin: '0 0 6px' }}>
                    A pipe class describes the pipe, fittings and material approved for a service: the available sizes and schedules, the material group and the pressure rating. A drawing takes its pipe sizes from the class chosen in the project.
                  </p>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Used by the solver:</strong> inside diameter (from size and schedule or wall thickness) and wall roughness ε, which set the friction loss.
                  </p>
                  <p style={{ margin: '0 0 6px' }}>
                    <strong>Informational only, not checked:</strong> pressure rating (e.g. CL150), the P-T rating table and corrosion allowance. WalFlow does not compare calculated pressures or temperatures with these values and does not reduce the wall for corrosion.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>TR2000</strong> is Equinor's piping class database. Importing a pipe class copies its sizes, schedules and ratings into the catalogue; later changes at Equinor are not synchronised.
                  </p>
                </div>
              </details>

              {/* Header Spec Banner Card */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: isEditing ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                padding: '20px 24px',
                boxShadow: isEditing ? '0 0 0 3px rgba(250, 133, 7, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'border 0.2s, box-shadow 0.2s'
              }}>
                {!isEditing && (
                  <DetailToolbar library={libraryActions}>
                    {canManage && (
                      <>
                        <button
                          onClick={() => handleCloneClass(activeClass)}
                          className="btn-secondary"
                          style={{ height: '32px', padding: '0 12px', fontSize: 'var(--fs-xs)', fontWeight: '700', gap: '4px' }}
                        >
                          <CopyIcon size={12} />
                          Clone / Duplicate
                        </button>
                        <button
                          onClick={handleStartEdit}
                          className="btn-secondary"
                          style={{ height: '32px', padding: '0 12px', fontSize: 'var(--fs-xs)', fontWeight: '700', gap: '4px' }}
                        >
                          <EditIcon size={12} />
                          Edit Pipe Class
                        </button>
                        <button aria-label="Delete class"
                          onClick={() => handleDeleteClass(activeClass)}
                          className="btn-danger-ghost"
                          style={{ height: '32px', width: '32px', padding: 0, borderRadius: '6px' }}
                          title="Delete Class"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </>
                    )}
                  </DetailToolbar>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  
                  {isEditing ? (
                    /* Inline Editing Header Fields */
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', marginBottom: '2px' }}>Class code *</label>
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
                          <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', marginBottom: '2px' }}>Pipe class name *</label>
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
                          <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', marginBottom: '2px' }}>Standard category</label>
                          <select
                            value={formData.standard}
                            onChange={(e) => updateFormField('standard', e.target.value)}
                            className="form-select"
                            style={{ height: '34px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}
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
                          <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', marginBottom: '2px' }}>Design standard / code *</label>
                          <input
                            type="text"
                            value={formData.design_code}
                            onChange={(e) => updateFormField('design_code', e.target.value)}
                            placeholder="e.g. ASME B31.3"
                            className="form-input"
                            style={{ width: '200px', height: '30px', fontSize: 'var(--fs-sm)' }}
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', marginBottom: '2px' }}>Revision *</label>
                          <input
                            type="text"
                            value={formData.revision}
                            onChange={(e) => updateFormField('revision', e.target.value)}
                            placeholder="e.g. 1.0, Rev B"
                            className="form-input"
                            style={{ width: '110px', height: '30px', fontSize: 'var(--fs-sm)' }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Read-Only Header View */
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <h2 style={{ margin: 0, fontSize: 'var(--fs-2xl)', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                          {activeClass.code} — {activeClass.name}
                        </h2>
                        <span title={activeClass.standard} style={{
                          fontSize: 'var(--fs-xs)',
                          fontWeight: '600',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: activeClass.is_builtin ? '#F1F5F9' : 'rgba(16, 185, 129, 0.12)',
                          color: activeClass.is_builtin ? 'var(--color-text-secondary)' : '#059669',
                          border: '1px solid var(--color-border)'
                        }}>
                          {sourceLabel(activeClass.standard)}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-text-secondary)' }}>
                        Standard: <strong>{activeClass.design_code}</strong> • Revision: <strong>{activeClass.revision}</strong>
                      </p>
                    </div>
                  )}

                  {/* Save / discard while editing; view-mode actions sit in the toolbar above */}
                  {canManage && isEditing && (
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="btn-secondary"
                        style={{ height: '34px', padding: '0 14px', borderRadius: '8px', fontSize: 'var(--fs-sm)', fontWeight: '700' }}
                      >
                        Cancel / Discard
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                        className="btn-primary"
                        style={{ height: '34px', padding: '0 18px', borderRadius: '8px', fontSize: 'var(--fs-sm)', fontWeight: '700' }}
                      >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Key Properties Grid */}
                {isEditing ? (
                  /* Editable Properties Grid */
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Material grade *</label>
                        <input
                          type="text"
                          value={formData.material_grade}
                          onChange={(e) => updateFormField('material_grade', e.target.value)}
                          placeholder="ASTM A106 Gr. B"
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Material group</label>
                        <input
                          type="text"
                          value={formData.material_group}
                          onChange={(e) => updateFormField('material_group', e.target.value)}
                          placeholder="CS / SS / DX"
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Pressure rating</label>
                        <input
                          type="text"
                          value={formData.rating_class}
                          onChange={(e) => updateFormField('rating_class', e.target.value)}
                          placeholder="CL150 / PN16"
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Roughness (ε mm)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={formData.roughness_mm}
                          onChange={(e) => updateFormField('roughness_mm', e.target.value)}
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                    </div>

                    {/* Design limits: class default corrosion allowance and design temperature range */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                      <div>
                        <label htmlFor="pc-default-ca" className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Default corrosion allowance [{units.length}]</label>
                        <DraftNumberInput
                          id="pc-default-ca"
                          step="any"
                          min="0"
                          displayValue={units.lengthOut(formData.corrosion_allowance_mm)}
                          onCommit={(text) => { const v = units.lengthIn(text); if (v !== null && v >= 0) updateFormField('corrosion_allowance_mm', v); }}
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                      <div>
                        <label htmlFor="pc-min-temp" className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Min design temperature [{units.temperature}]</label>
                        <DraftNumberInput
                          id="pc-min-temp"
                          step="any"
                          displayValue={units.temperatureOut(formData.min_temp_c)}
                          onCommit={(text) => updateFormField('min_temp_c', units.temperatureIn(text))}
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                      <div>
                        <label htmlFor="pc-max-temp" className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Max design temperature [{units.temperature}]</label>
                        <DraftNumberInput
                          id="pc-max-temp"
                          step="any"
                          displayValue={units.temperatureOut(formData.max_temp_c)}
                          onCommit={(text) => updateFormField('max_temp_c', units.temperatureIn(text))}
                          className="form-input"
                          style={{ height: '30px', fontSize: 'var(--fs-sm)' }}
                        />
                      </div>
                    </div>

                    {/* Catalogs of the class: sizes and reducers are taken from the ticked fitting catalogs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--color-border)' }}>
                      {[
                        { field: 'schedule_standard_codes', legend: 'Pipe dimension catalogs', options: scheduleStandardOptions },
                        { field: 'reducer_standard_codes', legend: 'Reducer catalogs', options: reducerStandardOptions },
                      ].map(({ field, legend, options }) => {
                        const selected = formData[field] || [];
                        const missing = selected.filter(code => !options.some(o => o.code === code));
                        return (
                          <fieldset key={field} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '8px 12px', margin: 0 }}>
                            <legend className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', padding: '0 4px' }}>{legend}</legend>
                            {options.length === 0 && (
                              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning-text)' }}>Catalog not loaded.</div>
                            )}
                            {[...options, ...missing.map(code => ({ code, name: `${code} (not in catalog)` }))].map(o => {
                              const checked = selected.includes(o.code);
                              return (
                                <label key={o.code} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '28px', fontSize: 'var(--fs-sm)', cursor: 'pointer' }}>
                                  <input type="checkbox" checked={checked} onChange={() => handleToggleCatalog(field, o.code)} />
                                  <span>{o.name}</span>
                                  {checked && selected[0] === o.code && selected.length > 1 && (
                                    <span title="Used first for new sizes and reducers" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0 4px' }}>default</span>
                                  )}
                                </label>
                              );
                            })}
                          </fieldset>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Read-Only Properties Grid */
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: '14px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                      <div>
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Material Group & Grade</span>
                        <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', marginTop: '2px' }}>
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
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Pressure Rating</span>
                        <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', marginTop: '2px' }}>{activeClass.rating_class}</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Surface Roughness (ε)</span>
                        <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', marginTop: '2px', color: 'var(--color-brand-dark)' }}>{activeClass.roughness_mm} mm</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Design Temp Range</span>
                        <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', marginTop: '2px' }}>
                          {activeClass.min_temp_c !== null ? units.temperatureOut(activeClass.min_temp_c) : '—'}{units.temperature} to {activeClass.max_temp_c !== null ? units.temperatureOut(activeClass.max_temp_c) : '—'}{units.temperature}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600' }}>Default Corrosion Allowance</span>
                        <div style={{ fontSize: 'var(--fs-base)', fontWeight: '700', marginTop: '2px' }}>{units.lengthOut(activeClass.corrosion_allowance_mm)} {units.length}</div>
                      </div>
                    </div>

                    {/* Catalogs of the class */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed var(--color-border)' }}>
                      {[
                        { label: 'Pipe dimension catalogs', codes: classScheduleCodes(activeClass), options: scheduleStandardOptions, icon: <ClipboardIcon size={18} color="var(--color-text-secondary)" /> },
                        { label: 'Reducer catalogs', codes: classReducerCodes(activeClass), options: reducerStandardOptions, icon: <RulerIcon size={18} color="var(--color-text-secondary)" /> },
                      ].map(({ label, codes, options, icon }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'var(--color-surface-light)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                          {icon}
                          <div>
                            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '600', display: 'block' }}>{label}</span>
                            {codes.map(code => (
                              <strong key={code} title={code} style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-brand-dark)', display: 'block' }}>
                                {catalogName(code, options)}
                              </strong>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
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
                  <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                    Sizes ({currentSpec.sizes.length})
                  </h3>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddSizeRow}
                      className="btn-secondary"
                      style={{ height: '28px', fontSize: 'var(--fs-xs)', fontWeight: '700', padding: '0 10px' }}
                    >
                      <PlusIcon size={12} /> Add size
                    </button>
                  )}
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-surface-light)', borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Nominal size</th>
                        <th style={{ padding: '8px 12px' }}>NPS [in]</th>
                        <th style={{ padding: '8px 12px' }}>Schedule</th>
                        <th style={{ padding: '8px 12px' }}>Catalog</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>OD [{units.length}]</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Wall thickness [{units.length}]</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>ID [{units.length}]</th>
                        <th style={{ padding: '8px 12px', textAlign: isEditing ? 'left' : 'right' }}>Corrosion allowance [{units.length}]</th>
                        {isEditing && <th style={{ padding: '8px 12px', textAlign: 'center', width: '80px' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {isEditing ? (
                        /* Editable Size Rows: DN and schedule picked from the class's catalogs; OD / WT come from the catalog */
                        (() => {
                          const codes = formData.schedule_standard_codes || [];
                          const listedDns = catalogDns(codes, scheduleStandardOptions);
                          const numCell = { padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
                          return formData.sizes.map((s, idx) => {
                            const isCustom = !!s.custom;
                            const dims = rowDimensions(s);
                            const od = parseFloat(dims?.od_mm) || 0;
                            const wt = parseFloat(dims?.wt_mm) || 0;
                            const calcId = Math.max(0, +(od - 2 * wt).toFixed(3));
                            const groups = isCustom ? [] : classScheduleChoices(Number(s.dn), codes, scheduleStandardOptions);
                            const listed = groups.some(g => g.code === s.catalog && g.schedules.includes(s.sch));
                            const rowLabel = `Size row ${idx + 1}`;
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: '6px 10px' }}>
                                  {isCustom ? (
                                    <input
                                      type="number"
                                      aria-label={`${rowLabel}: custom DN`}
                                      title="Size not taken from a catalog"
                                      value={s.dn}
                                      onChange={(e) => handleUpdateSizeRow(idx, 'dn', e.target.value)}
                                      className="form-input"
                                      style={{ width: '90px', height: '28px' }}
                                    />
                                  ) : (
                                    <select
                                      aria-label={`${rowLabel}: DN`}
                                      value={String(s.dn)}
                                      onChange={(e) => handlePickSizeDn(idx, e.target.value)}
                                      className="form-select"
                                      style={{ width: '110px', height: '28px', fontSize: 'var(--fs-sm)' }}
                                    >
                                      {!listedDns.includes(Number(s.dn)) && <option value={String(s.dn)}>DN {s.dn} (not listed)</option>}
                                      {listedDns.map(dn => <option key={dn} value={String(dn)}>DN {dn}</option>)}
                                      <option value="custom">Custom size…</option>
                                    </select>
                                  )}
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                  {isCustom ? (
                                    <input
                                      type="text"
                                      aria-label={`${rowLabel}: NPS`}
                                      value={s.nps}
                                      onChange={(e) => handleUpdateSizeRow(idx, 'nps', e.target.value)}
                                      className="form-input"
                                      style={{ width: '60px', height: '28px' }}
                                    />
                                  ) : (
                                    <span style={{ color: 'var(--color-text-secondary)' }}>{dims?.nps ?? '—'}</span>
                                  )}
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                  {isCustom ? (
                                    <input
                                      type="text"
                                      aria-label={`${rowLabel}: schedule`}
                                      value={s.sch}
                                      onChange={(e) => handleUpdateSizeRow(idx, 'sch', e.target.value)}
                                      className="form-input"
                                      style={{ width: '80px', height: '28px' }}
                                    />
                                  ) : (
                                    <select
                                      aria-label={`${rowLabel}: schedule`}
                                      value={`${s.catalog}|${s.sch}`}
                                      onChange={(e) => handlePickSchedule(idx, e.target.value)}
                                      className="form-select"
                                      style={{ width: '120px', height: '28px', fontSize: 'var(--fs-sm)' }}
                                    >
                                      {!listed && <option value={`${s.catalog}|${s.sch}`}>{scheduleLabel(s.sch)} (not listed)</option>}
                                      {groups.map(g => (
                                        <optgroup key={g.code} label={g.name}>
                                          {g.schedules.map(sch => <option key={sch} value={`${g.code}|${sch}`}>{scheduleLabel(sch)}</option>)}
                                        </optgroup>
                                      ))}
                                    </select>
                                  )}
                                </td>
                                <td style={{ padding: '6px 10px', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                                  {isCustom ? 'Custom' : catalogName(s.catalog, scheduleStandardOptions)}
                                </td>
                                {isCustom ? (
                                  <>
                                    <td style={{ padding: '6px 10px' }}>
                                      <DraftNumberInput
                                        aria-label={`${rowLabel}: outside diameter`}
                                        step="any"
                                        displayValue={units.lengthOut(s.od_mm)}
                                        onCommit={(text) => { const v = units.lengthIn(text); if (v !== null) handleUpdateSizeRow(idx, 'od_mm', v); }}
                                        className="form-input"
                                        style={{ width: '90px', height: '28px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '6px 10px' }}>
                                      <DraftNumberInput
                                        aria-label={`${rowLabel}: wall thickness`}
                                        step="any"
                                        displayValue={units.lengthOut(s.wt_mm)}
                                        onCommit={(text) => { const v = units.lengthIn(text); if (v !== null) handleUpdateSizeRow(idx, 'wt_mm', v); }}
                                        className="form-input"
                                        style={{ width: '90px', height: '28px' }}
                                      />
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td style={numCell}>{dims ? units.lengthOut(dims.od_mm) : '—'}</td>
                                    <td style={numCell}>{dims ? units.lengthOut(dims.wt_mm) : '—'}</td>
                                  </>
                                )}
                                <td style={{ ...numCell, color: calcId > 0 ? 'var(--color-text-primary)' : 'var(--color-danger)', fontWeight: '600' }}>
                                  {units.lengthOut(calcId)}
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                  <DraftNumberInput
                                    aria-label={`${rowLabel}: corrosion allowance`}
                                    step="any"
                                    min="0"
                                    displayValue={units.lengthOut(s.ca_mm)}
                                    onCommit={(text) => { const v = units.lengthIn(text); if (v !== null && v >= 0) handleUpdateSizeRow(idx, 'ca_mm', v); }}
                                    className="form-input"
                                    style={{ width: '80px', height: '28px' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${rowLabel.toLowerCase()}`}
                                    onClick={() => handleRemoveSizeRow(idx)}
                                    className="btn-danger-ghost"
                                    style={{ padding: '2px 8px', fontSize: 'var(--fs-xs)', height: '26px' }}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          });
                        })()
                      ) : (
                        /* Read-Only Size Rows (dimensions looked up in the catalog by the API) */
                        activeClass.sizes.map((s, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: '700' }}>DN {s.dn}</td>
                            <td style={{ padding: '10px 12px' }}>{s.nps ?? '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{scheduleLabel(s.sch)}</td>
                            <td style={{ padding: '10px 12px', fontSize: 'var(--fs-xs)', color: s.unresolved ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                              {s.custom ? 'Custom' : s.unresolved ? `Not in ${catalogName(s.catalog, scheduleStandardOptions)}` : catalogName(s.catalog, scheduleStandardOptions)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.unresolved ? '—' : units.lengthOut(s.od_mm)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.unresolved ? '—' : units.lengthOut(s.wt_mm)}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' }}>
                              {s.unresolved ? '—' : units.lengthOut(s.id_mm)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{units.lengthOut(s.ca_mm || 0)}</td>
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
                  <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                    Temperature vs. Pressure (P-T) Ratings
                  </h3>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleAddTempPressureRow}
                      className="btn-secondary"
                      style={{ height: '28px', fontSize: 'var(--fs-xs)', fontWeight: '700', padding: '0 10px' }}
                    >
                      + Add P-T Rating Row
                    </button>
                  )}
                </div>

                {isEditing ? (
                  /* Editable P-T Table */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', maxWidth: '600px', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--color-surface-light)', borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>Temperature [{units.temperature}]</th>
                          <th style={{ padding: '8px 12px' }}>Maximum pressure [{units.pressure}]</th>
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
                                <DraftNumberInput
                                  aria-label={`P-T point ${idx + 1}: temperature`}
                                  step="any"
                                  displayValue={units.temperatureOut(tp.temp_c)}
                                  onCommit={(text) => handleUpdateTempPressureRow(idx, 'temp_c', units.temperatureIn(text))}
                                  className="form-input"
                                  style={{ width: '120px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 12px' }}>
                                <DraftNumberInput
                                  aria-label={`P-T point ${idx + 1}: maximum pressure`}
                                  step="any"
                                  min="0"
                                  displayValue={units.pressureOut(tp.press_bar)}
                                  onCommit={(text) => { const v = units.pressureIn(text); if (v === null || v >= 0) handleUpdateTempPressureRow(idx, 'press_bar', v); }}
                                  className="form-input"
                                  style={{ width: '120px', height: '28px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTempPressureRow(idx)}
                                  className="btn-danger-ghost"
                                  style={{ padding: '2px 8px', fontSize: 'var(--fs-xs)', height: '26px' }}
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
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', fontWeight: '700' }}>{units.temperatureOut(tp.temp_c)}{units.temperature}</div>
                          <div style={{ fontSize: 'var(--fs-lg)', fontWeight: '800', color: 'var(--color-brand-dark)', marginTop: '2px' }}>{units.pressureOut(tp.press_bar)} {units.pressure}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
                      No P-T rating points defined for this pipe class.
                    </div>
                  )
                )}
              </div>

            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '40px', color: 'var(--color-text-secondary)' }}>
              {loading ? 'Loading catalog...' : pipeClasses.length === 0
                ? 'The pipe class library is empty. Create, import or restore pipe classes to get started.'
                : 'Select a pipe class from the left sidebar to view details.'}
              {!loading && libraryActions}
            </div>
          )}
        </main>
      </div>
      )}


      {/* NEW PIPE CLASS MINI-DIALOG */}
      {isNewClassModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '440px' }}>
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
                  color: 'var(--color-primary-text)'
                }}>
                  <PlusIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>New Pipe Class</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    Enter initial identification to begin editing on page
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewClassModalOpen(false)} className="modal-close-btn" aria-label="Close" title="Close">
                <CrossIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmNewClass} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Class code *</label>
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
                <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Class name *</label>
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
                <button type="submit" className="btn-primary" style={{ padding: '0 16px', height: '34px', fontSize: 'var(--fs-sm)', fontWeight: '700' }}>
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
          <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '800px', maxHeight: '90vh' }}>
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
                  color: 'var(--color-primary-text)'
                }}>
                  <GlobeIcon size={20} />
                </div>

                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>Import Equinor TR2000 Pipe Class</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    Fetch piping classes from Equinor's REST API into WalFlow
                  </p>
                </div>
              </div>
              <button onClick={() => setIsTr2000ModalOpen(false)} className="modal-close-btn" aria-label="Close" title="Close"><CrossIcon size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {tr2000Error && (
                <div style={{ color: 'var(--color-danger-text)', fontSize: 'var(--fs-sm)', padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid var(--color-danger)' }}>
                  {tr2000Error}
                </div>
              )}

              {/* Plant selector and Search Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>PCS library / plant</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', height: '36px', fontSize: 'var(--fs-sm)' }}
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
                  <label className="form-label" style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>Filter pipe class code</label>
                  <form onSubmit={handleSearchTr2000Submit} style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={tr2000SearchQuery}
                      onChange={(e) => setTr2000SearchQuery(e.target.value)}
                      placeholder="e.g. AC140, AC111, DX, CL300..."
                      className="form-input"
                      style={{ flexGrow: 1, height: '36px', fontSize: 'var(--fs-sm)' }}
                    />
                    <button type="submit" disabled={isSearchingTr2000} className="btn-secondary" style={{ height: '36px', padding: '0 14px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
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
                <label htmlFor="equinorTermsCheckbox" style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-primary)', cursor: 'pointer', lineHeight: '1.4' }}>
                  <strong>Equinor Terms & Conditions Acceptance:</strong> I acknowledge that TR2000 pipe classes are owned by Equinor. I have reviewed and agree to the{' '}
                  <a
                    href="https://www.equinor.com/about-us/terms-and-conditions"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--color-primary-text)', fontWeight: '700', textDecoration: 'underline' }}
                  >
                    Equinor Terms and Conditions
                  </a>
                  {' '}for downloading, referencing, and maintaining these pipe classes.
                </label>
              </div>

              {/* Results List Header with Quick Select Actions */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: 'var(--fs-sm)', fontWeight: '700', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Available Pipe Classes ({tr2000Results.length} found)
                    </h4>
                    {selectedTr2000Codes.size > 0 && (
                      <span style={{
                        fontSize: 'var(--fs-xs)',
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
                      style={{ height: '26px', padding: '0 10px', fontSize: 'var(--fs-xs)', fontWeight: '600' }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleUnselectAllTr2000}
                      disabled={selectedTr2000Codes.size === 0 || isSyncingTr2000}
                      className="btn-secondary"
                      style={{ height: '26px', padding: '0 10px', fontSize: 'var(--fs-xs)', fontWeight: '600' }}
                    >
                      Unselect All
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', backgroundColor: '#FFFFFF' }}>
                  {isSearchingTr2000 ? (
                    <div style={{ textAlign: 'center', padding: '30px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
                      Querying TR2000 API...
                    </div>
                  ) : tr2000Results.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
                      No pipe classes found for the current query in this plant.
                    </div>
                  ) : (
                    <table style={{ width: '100%', fontSize: 'var(--fs-sm)', borderCollapse: 'collapse' }}>
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
                            <tr {...clickableRowProps}
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
                              <td style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--color-primary-text)' }}>{code}</td>
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
                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-primary-text)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <SpinnerIcon size={12} /> Importing {batchSyncProgress.current} of {batchSyncProgress.total}: [{batchSyncProgress.currentCode}]...
                    </span>
                  ) : (
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                      {selectedTr2000Codes.size} pipe class{selectedTr2000Codes.size === 1 ? '' : 'es'} selected for download.
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
                      fontSize: 'var(--fs-sm)',
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

      {/* DUPLICATE PIPE CLASS CONFLICT RESOLUTION MODAL */}
      {isConflictModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 20000 }}>
          <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '600px' }}>

            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(250, 133, 7, 0.12)',
                  color: 'var(--color-primary-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <WarningIcon size={18} color="var(--color-primary)" />
                </div>

                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>Duplicate Pipe Classes Detected</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    {conflictList.length} of your selected pipe class(es) already exist in your local library.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsConflictModalOpen(false)} className="modal-close-btn" aria-label="Close" title="Close"><CrossIcon size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                  Set Action for All Conflicts:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleSetAllConflictActions('update')}
                    className="btn-secondary"
                    style={{ height: '24px', padding: '0 8px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}
                  >
                    Set All to Update
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllConflictActions('copy')}
                    className="btn-secondary"
                    style={{ height: '24px', padding: '0 8px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}
                  >
                    Set All to Copy (1)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllConflictActions('skip')}
                    className="btn-secondary"
                    style={{ height: '24px', padding: '0 8px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}
                  >
                    Set All to Skip
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                <table style={{ width: '100%', fontSize: 'var(--fs-xs)', borderCollapse: 'collapse' }}>
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
                        <td style={{ padding: '8px 10px', fontWeight: '800', color: 'var(--color-primary-text)' }}>{item.code}</td>
                        <td style={{ padding: '8px 10px' }}>{item.description}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '3px', backgroundColor: 'var(--color-surface)', padding: '2px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleConflictAction(item.code, 'update')}
                              style={{
                                padding: '2px 8px',
                                fontSize: 'var(--fs-xs)',
                                fontWeight: '700',
                                borderRadius: '3px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: item.action === 'update' ? 'var(--color-brand-dark)' : 'transparent',
                                color: item.action === 'update' ? '#ffffff' : 'var(--color-text-secondary)'
                              }}
                              title="Overwrite/Update the existing local pipe class"
                            >
                              Update
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateSingleConflictAction(item.code, 'copy')}
                              style={{
                                padding: '2px 8px',
                                fontSize: 'var(--fs-xs)',
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
                                fontSize: 'var(--fs-xs)',
                                fontWeight: '700',
                                borderRadius: '3px',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: item.action === 'skip' ? 'var(--color-brand-dark)' : 'transparent',
                                color: item.action === 'skip' ? '#ffffff' : 'var(--color-text-secondary)'
                              }}
                              title="Skip importing this pipe class"
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
                  style={{ color: 'var(--color-danger-text)' }}
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
          <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '520px' }}>
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
                  <h3 className="modal-title" style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>Catalog Import Summary</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    Results from importing the pipe classes JSON
                  </p>
                </div>
              </div>
              <button onClick={() => setIsImportReportModalOpen(false)} className="modal-close-btn" aria-label="Close" title="Close">
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
                <CheckCircleIcon size={20} color="#059669" />
                <div>
                  <div style={{ fontWeight: '700', fontSize: 'var(--fs-sm)', color: '#065F46' }}>
                    {importReport.imported_count} pipe classes successfully imported
                  </div>
                  {importReport.imported?.length > 0 && (
                    <div style={{ fontSize: 'var(--fs-xs)', color: '#047857', marginTop: '2px' }}>
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
                    <WarningIcon size={16} color="var(--color-warning-text-strong)" />
                    <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-warning-text-strong)' }}>
                      {importReport.skipped_duplicates.length} duplicate pipe classes were skipped (not imported):
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
                          color: 'var(--color-warning-text-strong)',
                          fontWeight: '700',
                          fontSize: 'var(--fs-xs)',
                          border: '1px solid #FCD34D'
                        }}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: 'var(--fs-xs)', color: '#B45309' }}>
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
                  <strong style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-danger-text)' }}>
                    {importReport.invalid_entries.length} entries could not be parsed:
                  </strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-danger-text)' }}>
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
                  style={{ padding: '0 18px', height: '34px', fontSize: 'var(--fs-sm)', fontWeight: '700' }}
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

export default CataloguePage;
