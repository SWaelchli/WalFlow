import React, { useState, useEffect, useCallback, useRef } from 'react';
import { confirmDialog, confirmDiscard, askName } from '../../utils/dialogs';
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
import { invalidateFittingStandards } from '../../hooks/useFittingStandards';
import {
  orderSchedules,
  scheduleLabel,
  getScheduleStandardOptions,
  DIN_SCHEDULE_STANDARD,
  DEFAULT_SCHEDULE_STANDARD
} from '../../utils/pipe_schedules';
import { coneAngleFromGeometry } from '../../utils/reducer_catalog';
import { specUnits } from '../../utils/specUnits';
import DraftNumberInput from '../common/DraftNumberInput';
import LibraryActions, { DetailToolbar } from './LibraryActions';

import { modalA11yRef } from '../../hooks/useModalA11y';
import { clickableProps } from '../../utils/a11yProps';

const STANDARD_GROUPS = ['ASME', 'DIN_EN', 'ISO', 'CUSTOM'];
const VALVE_GROUPS = ['IEC', 'CUSTOM'];
const GROUP_LABELS = { ASME: 'ASME', DIN_EN: 'DIN EN', ISO: 'ISO', IEC: 'IEC', CUSTOM: 'Custom' };
const groupLabel = (g) => GROUP_LABELS[g] || g;
const SUBTYPE_LABELS = { concentric: 'Concentric', eccentric: 'Eccentric', concentric_eccentric: 'Concentric & eccentric' };
const subtypeLabel = (t) => SUBTYPE_LABELS[t] || String(t || '').replace(/_/g, ' ');

/** Identifier for a catalog name: upper case, words joined by underscores (codes are what pipe classes reference). */
const codeFromName = (name) => String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);

const round = (v, decimals) => Number(Number(v).toFixed(decimals));
const isPositive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;

/** Reducer row with the cone angle recomputed from the two ODs and the length (as the backend stores it). */
const withConeAngle = (row) => {
  const odL = Number(row.od_large_mm), odS = Number(row.od_small_mm), len = Number(row.length_mm);
  if (!(odL > odS) || !(len > 0)) return row;
  return { ...row, cone_angle_deg: round(coneAngleFromGeometry(odL, odS, len), 2) };
};

/** Schedule row with every wall's ID recomputed from the OD. */
const withInsideDiameters = (row) => {
  const od = Number(row.od_mm);
  const schedules = Object.fromEntries(Object.entries(row.schedules || {}).map(([k, wall]) => [
    k, { ...wall, id_mm: od > 0 ? round(od - 2 * Number(wall.wt_mm), 3) : wall.id_mm }
  ]));
  return { ...row, schedules };
};

const EMPTY_VALVE_ROW = { code: '', valve_type: '', trim: '', flow_direction: '', fl: '', fd: '', xt: '' };
const isBlank = (v) => v === '' || v === null || v === undefined;

/** Control valve rows as the API takes them: numbers parsed, an empty x_T as null. */
const valveRowsForSave = (rows) => rows.map(r => ({
  ...r,
  code: String(r.code || '').trim(),
  valve_type: String(r.valve_type || '').trim(),
  trim: String(r.trim || '').trim(),
  flow_direction: String(r.flow_direction || '').trim(),
  fl: Number(r.fl),
  fd: Number(r.fd),
  xt: isBlank(r.xt) ? null : Number(r.xt)
}));

/** First problem with an edited dimensions table, or null. */
function dimensionError(type, rows) {
  if (type === 'control_valve') {
    const seen = new Set();
    for (const [i, r] of rows.entries()) {
      const label = `Row ${i + 1}`;
      const code = String(r.code || '').trim();
      if (code.length < 1 || code.length > 50) return `${label}: the code must be 1 to 50 characters.`;
      if (code.includes(':')) return `${label}: the code must not contain ':'.`;
      if (seen.has(code)) return `Code ${code} is listed more than once.`;
      seen.add(code);
      if (!String(r.valve_type || '').trim()) return `${label}: enter the valve type.`;
      if (isBlank(r.fl) || !(Number(r.fl) > 0 && Number(r.fl) <= 1)) return `${label}: F_L must be greater than 0 and at most 1.`;
      if (isBlank(r.fd) || !(Number(r.fd) > 0)) return `${label}: F_d must be greater than 0.`;
      if (!isBlank(r.xt) && !(Number(r.xt) > 0 && Number(r.xt) <= 1)) return `${label}: x_T must be empty or greater than 0 and at most 1.`;
    }
    return null;
  }
  if (type === 'reducer') {
    const seen = new Set();
    for (const [i, r] of rows.entries()) {
      const label = `Row ${i + 1}`;
      if (!isPositive(r.dn_large) || !isPositive(r.dn_small)) return `${label}: enter both DN values.`;
      if (Number(r.dn_large) <= Number(r.dn_small)) return `${label}: the large end DN must exceed the small end DN.`;
      if (!isPositive(r.length_mm)) return `${label}: the length must be positive.`;
      if (r.od_large_mm !== '' && r.od_small_mm !== '' && Number(r.od_large_mm) <= Number(r.od_small_mm)) {
        return `${label}: the large end OD must exceed the small end OD.`;
      }
      const key = `${Number(r.dn_large)}x${Number(r.dn_small)}`;
      if (seen.has(key)) return `DN${r.dn_large} x DN${r.dn_small} is listed more than once.`;
      seen.add(key);
    }
    return null;
  }
  const seen = new Set();
  for (const [i, r] of rows.entries()) {
    if (!isPositive(r.dn) || !Number.isInteger(Number(r.dn))) return `Row ${i + 1}: enter a whole-number DN.`;
    if (seen.has(Number(r.dn))) return `DN ${r.dn} is listed more than once.`;
    seen.add(Number(r.dn));
    if (!isPositive(r.od_mm)) return `DN ${r.dn}: enter the outside diameter.`;
    for (const [sch, wall] of Object.entries(r.schedules || {})) {
      if (!(Number(wall.wt_mm) > 0) || 2 * Number(wall.wt_mm) >= Number(r.od_mm)) {
        return `DN ${r.dn} ${scheduleLabel(sch)}: the wall thickness must be positive and less than half the OD.`;
      }
    }
  }
  return null;
}

const thStyle = { padding: '8px 12px' };
const cellStyle = { padding: '6px 8px' };
const smallInput = (width) => ({ width, height: '28px', fontSize: 'var(--fs-sm)' });
const fieldLabel = { display: 'block', fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-brand-dark)', marginBottom: '4px' };
const toolbarBtn = { height: '32px', padding: '0 12px', fontSize: 'var(--fs-xs)', fontWeight: '700', gap: '4px' };

const VALVE_COLUMNS = ['Code', 'Valve type', 'Trim', 'Flow direction'];
const valveNumberInvalid = (field, v) => {
  if (isBlank(v)) return field !== 'xt';
  const n = Number(v);
  if (field === 'fd') return !(n > 0);
  return !(n > 0 && n <= 1);
};
const formatFactor = (v) => (isBlank(v) || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(2));
const invalidBorder = { borderColor: 'var(--color-danger)' };

/** Control valve style rows: grouped by valve type when viewing, inline inputs when editing. */
function ValveStyleTable({ rows, isEditing, onChange, onNumber, onRemove }) {
  const head = (
    <thead>
      <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
        {VALVE_COLUMNS.map(label => <th key={label} style={thStyle}>{label}</th>)}
        <th style={{ ...thStyle, textAlign: isEditing ? 'left' : 'right' }}>F_L</th>
        <th style={{ ...thStyle, textAlign: isEditing ? 'left' : 'right' }}>F_d</th>
        <th style={{ ...thStyle, textAlign: isEditing ? 'left' : 'right' }} title="x_T is listed for reference; gas flow is not modelled">x_T (info)</th>
        {isEditing && <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>}
      </tr>
    </thead>
  );

  if (!isEditing) {
    // Group by valve type, keeping the catalogue order
    const byType = [];
    rows.forEach(row => {
      const type = row.valve_type || '—';
      let group = byType.find(g => g.type === type);
      if (!group) { group = { type, rows: [] }; byType.push(group); }
      group.rows.push(row);
    });
    const factorStyle = { ...thStyle, fontWeight: '700', color: 'var(--color-brand-dark)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' };
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
        {head}
        <tbody>
          {byType.map(group => (
            <React.Fragment key={group.type}>
              <tr style={{ backgroundColor: 'var(--color-surface-light)' }}>
                <td colSpan={7} style={{ ...thStyle, fontWeight: '800', color: 'var(--color-brand-dark)' }}>{group.type}</td>
              </tr>
              {group.rows.map(row => (
                <tr key={row.code} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ ...thStyle, fontWeight: '700' }}><code>{row.code}</code></td>
                  <td style={thStyle}>{row.valve_type}</td>
                  <td style={{ ...thStyle, color: 'var(--color-text-secondary)' }}>{row.trim || '—'}</td>
                  <td style={{ ...thStyle, color: 'var(--color-text-secondary)' }}>{row.flow_direction || '—'}</td>
                  <td style={factorStyle}>{formatFactor(row.fl)}</td>
                  <td style={factorStyle}>{formatFactor(row.fd)}</td>
                  <td style={{ ...thStyle, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{formatFactor(row.xt)}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
      {head}
      <tbody>
        {rows.map((row, idx) => {
          const label = `Row ${idx + 1}`;
          const codeText = String(row.code || '').trim();
          const codeInvalid = codeText === '' || codeText.length > 50 || codeText.includes(':')
            || rows.some((r, i) => i !== idx && String(r.code || '').trim() === codeText);
          const textInput = (field, name, width, invalid = false) => (
            <input
              type="text"
              aria-label={`${label}: ${name}`}
              value={row[field] ?? ''}
              onChange={(e) => onChange(idx, r => ({ ...r, [field]: e.target.value }))}
              className="form-input"
              style={{ ...smallInput(width), ...(invalid ? invalidBorder : {}) }}
            />
          );
          const numberInput = (field, name) => (
            <DraftNumberInput
              aria-label={`${label}: ${name}`}
              step="any"
              min="0"
              placeholder={field === 'xt' ? '—' : undefined}
              displayValue={row[field]}
              onCommit={(text) => onNumber(idx, field, text)}
              className="form-input"
              style={{ ...smallInput('72px'), ...(valveNumberInvalid(field, row[field]) ? invalidBorder : {}) }}
            />
          );
          return (
            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={cellStyle}>{textInput('code', 'code', '190px', codeInvalid)}</td>
              <td style={cellStyle}>{textInput('valve_type', 'valve type', '150px', !String(row.valve_type || '').trim())}</td>
              <td style={cellStyle}>{textInput('trim', 'trim', '170px')}</td>
              <td style={cellStyle}>{textInput('flow_direction', 'flow direction', '110px')}</td>
              <td style={cellStyle}>{numberInput('fl', 'F_L')}</td>
              <td style={cellStyle}>{numberInput('fd', 'F_d')}</td>
              <td style={cellStyle}>{numberInput('xt', 'x_T')}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>
                <button aria-label={`Remove ${label.toLowerCase()}`}
                  onClick={() => onRemove(idx)}
                  className="btn-danger-ghost"
                  style={{ height: '28px', padding: '0 8px' }}
                  title="Remove style row"
                >
                  <TrashIcon size={12} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Catalogue tab for fitting standards. `fittingType` 'control_valve' switches it to the control valve
 * style catalogues (same layout and flows); otherwise it shows reducers and pipe schedules.
 */
const FittingStandardsTab = function FittingStandardsTab({ canManage, currentUser, onDirtyChange, fittingType = null }) {
  const isValve = fittingType === 'control_valve';
  const groups = isValve ? VALVE_GROUPS : STANDARD_GROUPS;
  const { isImperial } = useUnits();
  const units = specUnits(isImperial);
  const isAdmin = currentUser?.role === 'admin';

  const [standards, setStandards] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL | reducer | pipe_schedule
  const [standardFilter, setStandardFilter] = useState('ALL'); // ALL | ASME | DIN_EN | CUSTOM

  // Edit mode: a working copy of the standard, plus the schedule columns (a new column has no values yet)
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [editColumns, setEditColumns] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState('');
  const isDirty = isEditing && JSON.stringify([editFormData, editColumns]) !== editSnapshot;

  // Clone / New dialogs: the code follows the name until it is edited by hand
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneCode, setCloneCode] = useState('');
  const [cloneCodeTouched, setCloneCodeTouched] = useState(false);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newStandardData, setNewStandardData] = useState(null);
  const [newCodeTouched, setNewCodeTouched] = useState(false);

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState(null); // { type: 'success'|'error', text: '' }

  const fileInputRef = useRef(null);

  // The page asks before switching tabs or leaving while this tab has unsaved edits
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch standards catalog
  const fetchStandards = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/fitting-standards', isValve ? { params: { fitting_type: 'control_valve' } } : undefined);
      // The fitting tab leaves out the control valve styles: they have their own tab
      const list = isValve ? res.data : res.data.filter(item => item.fitting_type !== 'control_valve');
      setStandards(list);
      setSelectedId(prev => prev ?? list[0]?.id ?? null);
      return list;
    } catch {
      setError(isValve ? 'Failed to fetch the control valve style catalogues.' : 'Failed to fetch fitting standards and schedules catalog.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isValve]);

  // After a create / edit / clone / delete / import / restore: canvas inspectors and the pipe class tab re-read the catalog
  const refreshAfterChange = async () => {
    invalidateFittingStandards(isValve ? 'control_valve' : undefined);
    return fetchStandards();
  };

  useEffect(() => {
    fetchStandards();
  }, [fetchStandards]);

  const selectedStandard = standards.find(s => s.id === selectedId) || standards[0] || null;
  const shown = isEditing && editFormData ? editFormData : selectedStandard;
  const isReducer = shown?.fitting_type === 'reducer';
  const canEdit = (item) => !!item && canManage && (!item.is_builtin || isAdmin);
  const scheduleOptions = getScheduleStandardOptions(standards);

  // Schedule matrix columns: every designation the standard lists (e.g. STD / 40 or Normal / Heavy)
  const columnsOf = (item) => (item?.fitting_type === 'pipe_schedule'
    ? orderSchedules([...new Set((item.dimensions || []).flatMap(row => Object.keys(row.schedules || {})))])
    : []);
  const scheduleColumns = isEditing ? editColumns : columnsOf(selectedStandard);

  // Filtered standards for sidebar
  const filteredStandards = standards.filter(item => {
    if (typeFilter !== 'ALL' && item.fitting_type !== typeFilter) return false;
    if (standardFilter !== 'ALL' && item.standard !== standardFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return [item.code, item.name, item.description || ''].some(text => text.toLowerCase().includes(q));
    }
    return true;
  });

  const askDiscard = async (action) => {
    if (!isEditing) return true;
    if (isDirty && !(await confirmDiscard(action))) return false;
    setIsEditing(false);
    setEditFormData(null);
    return true;
  };

  // Restore Defaults: re-adds missing built-in catalogs from the seed; admins may also reset edited built-ins
  const handleSeedDefaults = async () => {
    const resetBuiltins = isAdmin && await confirmDialog({
      title: 'Restore default catalogs',
      message: `Missing built-in catalogs are added again. Also reset edited built-in catalogs to the shipped data?${isValve ? '' : ' Sizes that pipe classes use cannot be removed.'}`,
      confirmLabel: 'Also reset edited',
      cancelLabel: 'Only add missing',
    });
    try {
      const res = await axios.post('/api/fitting-standards/seed-defaults', null, { params: { restore_builtins: resetBuiltins } });
      showToast(`Default catalogs restored (${res.data.seeded_count || 0} added, ${res.data.restored_count || 0} reset).`);
      refreshAfterChange();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to restore default fitting standards.', 'error');
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
        refreshAfterChange();
      } catch (err) {
        showToast(`Failed to import JSON library: ${err?.response?.data?.detail || err.message}`, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // --- Clone ---
  const handleOpenCloneModal = () => {
    if (!selectedStandard) return;
    const name = `${selectedStandard.name} (Custom Copy)`;
    setCloneName(name);
    setCloneCode(`${selectedStandard.code}_CUSTOM`);
    setCloneCodeTouched(false);
    setIsCloneModalOpen(true);
  };

  const handleConfirmClone = async () => {
    if (!cloneCode.trim() || !cloneName.trim()) {
      showToast('Please enter a name and an identifier.', 'error');
      return;
    }
    try {
      const res = await axios.post(`/api/fitting-standards/${selectedStandard.id}/clone`, {
        new_code: cloneCode.trim().toUpperCase(),
        new_name: cloneName.trim()
      });
      showToast(`Created '${res.data.name}'.`);
      setIsCloneModalOpen(false);
      await refreshAfterChange();
      setSelectedId(res.data.id);
    } catch (err) {
      showToast(`Clone failed: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  };

  // --- New standard ---
  const handleOpenNewModal = async () => {
    if (!(await askDiscard('create a new standard'))) return;
    setNewStandardData({ code: '', name: '', standard: 'CUSTOM', fitting_type: isValve ? 'control_valve' : 'reducer', subtype: 'concentric', description: '' });
    setNewCodeTouched(false);
    setIsNewModalOpen(true);
  };

  const handleCreateNewStandard = async () => {
    if (!newStandardData.code.trim() || !newStandardData.name.trim()) {
      showToast('Please enter a name and an identifier.', 'error');
      return;
    }
    try {
      const res = await axios.post('/api/fitting-standards', {
        code: newStandardData.code.trim().toUpperCase(),
        name: newStandardData.name.trim(),
        standard: newStandardData.standard,
        fitting_type: newStandardData.fitting_type,
        subtype: newStandardData.fitting_type === 'reducer' ? newStandardData.subtype : null,
        description: newStandardData.description,
        dimensions: []
      });
      showToast(`Created '${res.data.name}'. ${isValve ? 'Add its valve styles and save.' : 'Add its sizes and save.'}`);
      setIsNewModalOpen(false);
      await refreshAfterChange();
      setSelectedId(res.data.id);
      // A new standard has no sizes yet: open it for editing straight away
      startEdit(res.data);
    } catch (err) {
      showToast(`Creation failed: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  };

  // --- Delete ---
  const handleDeleteStandard = async (item) => {
    if (item.is_builtin) {
      showToast('Built-in standard library components cannot be deleted.', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: 'Delete standard?',
      message: `Permanently delete '${item.name}'?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await axios.delete(`/api/fitting-standards/${item.id}`);
      showToast(`'${item.name}' deleted.`);
      setSelectedId(null);
      await refreshAfterChange();
    } catch (err) {
      showToast(`Delete failed: ${err?.response?.data?.detail || err.message}`, 'error');
    }
  };

  // --- Edit ---
  const startEdit = (item) => {
    const copy = JSON.parse(JSON.stringify(item));
    // A new control valve catalogue starts with one empty row to fill in
    if (copy.fitting_type === 'control_valve' && (copy.dimensions || []).length === 0) copy.dimensions = [{ ...EMPTY_VALVE_ROW }];
    const columns = columnsOf(copy);
    setEditFormData(copy);
    setEditColumns(columns);
    setEditSnapshot(JSON.stringify([copy, columns]));
    setIsEditing(true);
  };

  const handleCancelEdit = () => { askDiscard('stop editing'); };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    if (!editFormData.name.trim()) {
      showToast('Please enter a name.', 'error');
      return;
    }
    // The server recomputes the derived values (ID, cone angle); the edit handlers keep them current for the preview
    const type = editFormData.fitting_type;
    const rows = type === 'control_valve' ? valveRowsForSave(editFormData.dimensions) : editFormData.dimensions;
    const problem = dimensionError(type, rows);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await axios.put(`/api/fitting-standards/${editFormData.id}`, {
        name: editFormData.name.trim(),
        standard: editFormData.standard,
        subtype: type === 'reducer' ? (editFormData.subtype || 'concentric') : undefined,
        description: editFormData.description || '',
        dimensions: rows
      });
      showToast('Standard updated successfully.');
      setIsEditing(false);
      setEditFormData(null);
      await refreshAfterChange();
      setSelectedId(res.data.id);
    } catch (err) {
      showToast(`Save failed: ${err?.response?.data?.detail || err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const setField = (field, value) => setEditFormData(prev => ({ ...prev, [field]: value }));

  const updateRow = (idx, update) => {
    setEditFormData(prev => ({
      ...prev,
      dimensions: prev.dimensions.map((row, i) => (i === idx ? update(row) : row))
    }));
  };

  const handleRemoveDimensionRow = (idx) => {
    setEditFormData(prev => ({ ...prev, dimensions: prev.dimensions.filter((_, i) => i !== idx) }));
  };

  // NPS and OD of a DN from the pipe dimension catalogs: the catalog matching the standard group first
  const lookupPipeSize = (dn) => {
    const preferred = editFormData?.standard === 'DIN_EN' || String(editFormData?.code || '').startsWith('DIN_EN')
      ? DIN_SCHEDULE_STANDARD : DEFAULT_SCHEDULE_STANDARD;
    const ordered = [...scheduleOptions].sort((a, b) => (b.code === preferred) - (a.code === preferred));
    for (const option of ordered) {
      const row = (option.dimensions || []).find(r => Number(r.dn) === Number(dn));
      if (row) return { nps: row.nps, od_mm: row.od_mm };
    }
    return null;
  };

  // Reducer: a new DN fills NPS and OD from the pipe catalogs (both stay editable); the cone angle follows
  const handleReducerDn = (idx, end, text) => {
    const dn = parseInt(text, 10);
    if (!(dn > 0)) return;
    const size = lookupPipeSize(dn);
    updateRow(idx, row => withConeAngle({
      ...row,
      [`dn_${end}`]: dn,
      ...(size ? { [`nps_${end}`]: size.nps, [`od_${end}_mm`]: size.od_mm } : {})
    }));
  };

  const handleAddValveRow = () => {
    setEditFormData(prev => {
      const last = prev.dimensions[prev.dimensions.length - 1];
      // A new style starts from the previous row's valve type so grouped styles are quick to enter
      const row = { ...EMPTY_VALVE_ROW, valve_type: last?.valve_type ?? '' };
      return { ...prev, dimensions: [...prev.dimensions, row] };
    });
  };

  // F_L, F_d and x_T: an out-of-range number is stored so the field is flagged and Save explains it
  const handleValveNumber = (idx, field, text) => {
    const value = String(text).trim() === '' ? '' : Number(text);
    if (value !== '' && !Number.isFinite(value)) return;
    updateRow(idx, row => ({ ...row, [field]: value }));
  };

  const handleAddReducerRow = () => {
    setEditFormData(prev => {
      const last = prev.dimensions[prev.dimensions.length - 1];
      const large = lookupPipeSize(50), small = lookupPipeSize(40);
      const row = last
        ? { ...last }
        : { dn_large: 50, nps_large: large?.nps ?? '2', od_large_mm: large?.od_mm ?? 60.3, dn_small: 40, nps_small: small?.nps ?? '1 1/2', od_small_mm: small?.od_mm ?? 48.3, length_mm: 76 };
      return { ...prev, dimensions: [...prev.dimensions, withConeAngle(row)] };
    });
  };

  // Schedules: a new size row gets the next catalog DN not yet listed, with its NPS and OD
  const handleAddScheduleRow = () => {
    setEditFormData(prev => {
      // Blank or invalid DNs are ignored, so one unfinished row does not block further suggestions
      const used = new Set(prev.dimensions.map(r => Number(r.dn)).filter(dn => dn > 0));
      const last = Math.max(0, ...used);
      const candidates = [...new Set(scheduleOptions.flatMap(o => (o.dimensions || []).map(r => Number(r.dn))))].sort((a, b) => a - b);
      const dn = candidates.find(d => d > last && !used.has(d));
      const size = dn ? lookupPipeSize(dn) : null;
      const row = { dn: dn ?? '', nps: size?.nps ?? '', od_mm: size?.od_mm ?? '', schedules: {} };
      return { ...prev, dimensions: [...prev.dimensions, row] };
    });
  };

  // Schedules: a new DN fills NPS and OD from the pipe catalogs like the reducer table (both stay editable)
  const handleScheduleDn = (idx, text) => {
    const dn = parseInt(text, 10);
    if (!(dn > 0)) return;
    updateRow(idx, row => {
      if (Number(row.dn) === dn) return row;
      const size = lookupPipeSize(dn);
      return withInsideDiameters({ ...row, dn, ...(size ? { nps: size.nps, od_mm: size.od_mm } : {}) });
    });
  };

  const handleWall = (idx, sch, text) => {
    if (String(text).trim() === '') {
      updateRow(idx, row => {
        const schedules = { ...(row.schedules || {}) };
        delete schedules[sch];
        return { ...row, schedules };
      });
      return;
    }
    const wt = units.lengthIn(text);
    if (wt === null || wt <= 0) return;
    updateRow(idx, row => withInsideDiameters({ ...row, schedules: { ...(row.schedules || {}), [sch]: { ...row.schedules?.[sch], wt_mm: round(wt, 3) } } }));
  };

  const handleAddScheduleColumn = async () => {
    const name = await askName({ title: 'Add schedule', label: 'Schedule designation', placeholder: 'e.g. 80, XS, 40S, Heavy', confirmLabel: 'Add' });
    if (!name) return;
    const key = name.replace(/^sch\.?\s*/i, '').trim();
    if (!key) return;
    if (editColumns.some(c => c.toUpperCase() === key.toUpperCase())) {
      showToast(`${scheduleLabel(key)} is already a column.`, 'error');
      return;
    }
    setEditColumns(prev => [...prev, key]);
  };

  const handleRemoveScheduleColumn = (sch) => {
    setEditColumns(prev => prev.filter(c => c !== sch));
    setEditFormData(prev => ({
      ...prev,
      dimensions: prev.dimensions.map(row => {
        const schedules = { ...(row.schedules || {}) };
        delete schedules[sch];
        return { ...row, schedules };
      })
    }));
  };

  const libraryActions = (
    <LibraryActions
      canManage={canManage}
      newLabel={isValve ? 'New control valve catalogue' : 'New fitting standard'}
      onNew={handleOpenNewModal}
      onImport={() => fileInputRef.current?.click()}
      importTitle={isValve ? 'Import catalogues from a JSON file' : 'Import fitting standards from a JSON file'}
      onExport={handleExportLibrary}
      exportTitle={isValve ? 'Export the catalogue library as a JSON file' : 'Export all fitting standards and schedules as a JSON file'}
      onRestore={handleSeedDefaults}
      restoreTitle={isValve ? 'Restore the built-in control valve style catalogues' : 'Restore the built-in fitting catalogs (reducers and pipe schedules)'}
    />
  );

  const dims = shown?.dimensions || [];

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
        <div role="status" style={{
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
          maxWidth: '520px',
          animation: 'walflowFadeIn 0.2s ease-out'
        }}>
          {toastMessage.type === 'error' ? (
            <WarningIcon size={16} color="#DC2626" />
          ) : (
            <CheckCircleIcon size={16} color="#16A34A" />
          )}
          <span style={{
            fontSize: 'var(--fs-sm)',
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
            style={{ width: '100%', height: '34px', fontSize: 'var(--fs-sm)' }}
            placeholder={isValve ? 'Search valve style catalogues...' : 'Search standards & schedules...'}
            aria-label={isValve ? 'Search valve style catalogues' : 'Search standards and schedules'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Type Filter Pills */}
          {!isValve && <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { key: 'ALL', label: 'All' },
              { key: 'reducer', label: 'Reducers' },
              { key: 'pipe_schedule', label: 'Schedules' }
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setTypeFilter(item.key)}
                aria-pressed={typeFilter === item.key}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 'var(--fs-xs)',
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
          </div>}

          {/* Standard Filter Pills */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', ...groups.filter(g => g !== 'ISO')].map(key => (
              <button
                key={key}
                onClick={() => setStandardFilter(key)}
                aria-pressed={standardFilter === key}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 'var(--fs-xs)',
                  fontWeight: '700',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: standardFilter === key ? 'var(--color-brand-dark)' : 'var(--color-surface-light)',
                  color: standardFilter === key ? '#FFFFFF' : 'var(--color-text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {key === 'ALL' ? 'All' : groupLabel(key)}
              </button>
            ))}
          </div>
        </div>

        {/* List of Standards: the name leads; the identifier is searchable but not shown */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
          {error && (
            <div style={{ color: 'var(--color-danger-text)', fontSize: 'var(--fs-sm)', padding: '10px' }}>
              {error}
            </div>
          )}

          {loading && standards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
              Loading catalog...
            </div>
          ) : filteredStandards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
              {isValve ? 'No control valve style catalogues match criteria.' : 'No fitting standards match criteria.'}
            </div>
          ) : (
            filteredStandards.map(item => {
              const isSelected = item.id === selectedStandard?.id;
              const dimCount = Array.isArray(item.dimensions) ? item.dimensions.length : 0;
              return (
                <div {...clickableProps}
                  key={item.id}
                  title={item.code}
                  onClick={async () => {
                    if (item.id === selectedStandard?.id) return;
                    if (!(await askDiscard('switch'))) return;
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontWeight: '800',
                      fontSize: 'var(--fs-sm)',
                      lineHeight: 1.3,
                      color: isSelected ? 'var(--color-primary-text)' : 'var(--color-text-primary)'
                    }}>
                      {item.name}
                    </span>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 'var(--fs-xs)',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: item.is_builtin ? '#E2E8F0' : 'rgba(16, 185, 129, 0.15)',
                      color: item.is_builtin ? 'var(--color-text-secondary)' : '#059669'
                    }}>
                      {item.is_builtin ? 'Built-in' : 'Custom'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    <span>{{ reducer: 'Reducer / Expander', control_valve: 'Control valve styles' }[item.fitting_type] || 'Pipe Schedules'} • {groupLabel(item.standard)}</span>
                    <span>{dimCount} {{ reducer: 'sizes', control_valve: 'styles' }[item.fitting_type] || 'DN entries'}</span>
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
        {shown ? (
          <>
            {/* Card 1: Standard Header */}
            <div style={{
              borderRadius: '12px',
              backgroundColor: '#FFFFFF',
              border: isEditing ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
              padding: '20px 24px',
              boxShadow: isEditing ? '0 0 0 3px rgba(250, 133, 7, 0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'border 0.2s, box-shadow 0.2s'
            }}>
              {!isEditing && (
                <DetailToolbar library={libraryActions}>
                  {canManage && (
                    <button
                      onClick={handleOpenCloneModal}
                      className="btn-secondary"
                      style={toolbarBtn}
                      title="Clone into an editable custom version"
                    >
                      <CopyIcon size={12} />
                      {isValve ? 'Clone Catalogue' : 'Clone Standard'}
                    </button>
                  )}
                  {canEdit(selectedStandard) && (
                    <button
                      onClick={() => startEdit(selectedStandard)}
                      className="btn-secondary"
                      style={toolbarBtn}
                    >
                      <EditIcon size={12} />
                      {isValve ? 'Edit Catalogue' : 'Edit Standard'}
                    </button>
                  )}
                  {canManage && !selectedStandard.is_builtin && (
                    <button aria-label="Delete standard"
                      onClick={() => handleDeleteStandard(selectedStandard)}
                      className="btn-danger-ghost"
                      style={{ height: '32px', width: '32px', padding: 0, borderRadius: '6px' }}
                      title="Delete standard"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </DetailToolbar>
              )}

              {isEditing ? (
                /* Editable header fields; the identifier stays fixed because pipe classes reference it */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <div style={{ flexGrow: 1 }}>
                      <label htmlFor="fs-name" style={fieldLabel}>Name *</label>
                      <input
                        id="fs-name"
                        type="text"
                        className="form-input"
                        style={{ width: '100%', height: '34px', fontWeight: '700' }}
                        value={editFormData.name}
                        onChange={(e) => setField('name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="fs-group" style={fieldLabel}>Standard group</label>
                      <select
                        id="fs-group"
                        className="form-select"
                        style={{ height: '34px', fontSize: 'var(--fs-sm)' }}
                        value={editFormData.standard}
                        onChange={(e) => setField('standard', e.target.value)}
                      >
                        {[...new Set([...groups, editFormData.standard])].map(g => (
                          <option key={g} value={g}>{groupLabel(g)}</option>
                        ))}
                      </select>
                    </div>
                    {isReducer && (
                      <div>
                        <label htmlFor="fs-subtype" style={fieldLabel}>Reducer type</label>
                        <select
                          id="fs-subtype"
                          className="form-select"
                          style={{ height: '34px', fontSize: 'var(--fs-sm)' }}
                          value={editFormData.subtype || 'concentric'}
                          onChange={(e) => setField('subtype', e.target.value)}
                        >
                          {[...new Set([...Object.keys(SUBTYPE_LABELS), editFormData.subtype || 'concentric'])].map(t => (
                            <option key={t} value={t}>{subtypeLabel(t)}</option>
                          ))}
                        </select>
                      </div>
                    )}
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
                  </div>
                  <div>
                    <label htmlFor="fs-description" style={fieldLabel}>Description</label>
                    <input
                      id="fs-description"
                      type="text"
                      className="form-input"
                      style={{ width: '100%', fontSize: 'var(--fs-sm)' }}
                      value={editFormData.description || ''}
                      onChange={(e) => setField('description', e.target.value)}
                      placeholder="Source document, scope, notes..."
                    />
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' }}>
                    Identifier <code title="Used by pipe classes and library files; it cannot be changed">{editFormData.code}</code>
                    {editFormData.is_builtin && (
                      <span style={{ marginLeft: '12px', color: 'var(--color-warning-text)', fontWeight: '600' }}>
                        Built-in catalog: Restore defaults can reset your changes to the shipped data.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '6px' }}>
                    <h2 style={{ margin: 0, fontSize: 'var(--fs-2xl)', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                      {shown.name}
                    </h2>
                    <span style={{
                      fontSize: 'var(--fs-xs)',
                      fontWeight: '600',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: shown.is_builtin ? '#F1F5F9' : 'rgba(16, 185, 129, 0.12)',
                      color: shown.is_builtin ? 'var(--color-text-secondary)' : '#059669',
                      border: '1px solid var(--color-border)'
                    }}>
                      {shown.is_builtin ? 'Built-in' : 'Custom'}
                    </span>
                    <span style={{
                      fontSize: 'var(--fs-xs)',
                      fontWeight: '600',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-surface-light)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)'
                    }}>
                      {groupLabel(shown.standard)} • {isReducer ? `Reducer${shown.subtype ? ` (${subtypeLabel(shown.subtype).toLowerCase()})` : ''}` : shown.fitting_type === 'control_valve' ? 'Control valve styles' : 'Pipe schedules'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)', maxWidth: '800px' }}>
                    {shown.description || (isValve ? 'Control valve style factors table.' : 'Standard engineering fitting dimensions table.')}
                  </p>
                  <div style={{ marginTop: '6px', fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' }}>
                    Identifier <code title="Used by pipe classes and library files">{shown.code}</code>
                  </div>
                </div>
              )}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: '800', color: 'var(--color-brand-dark)' }}>
                  {isValve ? `Valve styles (${dims.length})` : isReducer ? `Reducer size combinations (${dims.length})` : `Pipe dimensions & schedules (${dims.length})`}
                </h3>
                {isEditing && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!isReducer && !isValve && (
                      <button onClick={handleAddScheduleColumn} className="btn-secondary" style={{ ...toolbarBtn, height: '28px', padding: '0 10px' }}>
                        <PlusIcon size={12} />
                        Add schedule
                      </button>
                    )}
                    <button
                      onClick={isValve ? handleAddValveRow : isReducer ? handleAddReducerRow : handleAddScheduleRow}
                      className="btn-secondary"
                      style={{ ...toolbarBtn, height: '28px', padding: '0 10px' }}
                    >
                      <PlusIcon size={12} />
                      {isValve ? 'Add style' : 'Add size'}
                    </button>
                  </div>
                )}
              </div>

              {isValve && (
                <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                  Typical values from IEC 60534-2-1:2011 Table D.2. Manufacturer data takes precedence: add a catalogue with the datasheet values. Flow to open: the flow pushes the plug away from the seat. Flow to close: the flow pushes it towards the seat. Cage: flow out = from inside the cage outwards.
                </p>
              )}

              {isEditing && (
                <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                  {isValve
                    ? 'Codes are unique within the catalogue and must not contain ":". F_L: above 0 up to 1. F_d: above 0. x_T is listed for reference; gas flow is not modelled.'
                    : isReducer
                    ? 'Entering a DN fills NPS and OD from the pipe dimension catalogs; both can be overwritten. The cone angle follows from the ODs and the length.'
                    : 'ID is calculated as OD − 2 × wall thickness. Leave a wall thickness empty when the schedule does not exist for that size.'}
                </p>
              )}

              <div style={{ overflowX: 'auto' }}>
                {isValve ? (
                  <ValveStyleTable
                    rows={dims}
                    isEditing={isEditing}
                    onChange={updateRow}
                    onNumber={handleValveNumber}
                    onRemove={handleRemoveDimensionRow}
                  />
                ) : isReducer ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
                        <th style={thStyle}>Large end DN</th>
                        <th style={thStyle}>Large NPS [in]</th>
                        <th style={thStyle}>Large OD [{units.length}]</th>
                        <th style={thStyle}>Small end DN</th>
                        <th style={thStyle}>Small NPS [in]</th>
                        <th style={thStyle}>Small OD [{units.length}]</th>
                        <th style={thStyle}>Length H [{units.length}]</th>
                        <th style={thStyle}>Cone angle θ</th>
                        {isEditing && <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {dims.map((row, idx) => {
                        const label = `Row ${idx + 1}`;
                        const angle = Number(row.cone_angle_deg);
                        const npsText = (nps) => (nps ? (String(nps).toUpperCase().startsWith('DN') ? '—' : `${nps}"`) : '—');
                        if (!isEditing) {
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ ...thStyle, fontWeight: '700' }}>DN{row.dn_large}</td>
                              <td style={{ ...thStyle, color: 'var(--color-text-secondary)' }}>{npsText(row.nps_large)}</td>
                              <td style={thStyle}>{units.lengthOut(row.od_large_mm)}</td>
                              <td style={{ ...thStyle, fontWeight: '700' }}>DN{row.dn_small}</td>
                              <td style={{ ...thStyle, color: 'var(--color-text-secondary)' }}>{npsText(row.nps_small)}</td>
                              <td style={thStyle}>{units.lengthOut(row.od_small_mm)}</td>
                              <td style={{ ...thStyle, fontWeight: '700', color: 'var(--color-brand-dark)' }}>{units.lengthOut(row.length_mm)}</td>
                              <td style={{ ...thStyle, color: 'var(--color-text-secondary)' }}>{angle > 0 ? `${angle.toFixed(1)}°` : '—'}</td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            {['large', 'small'].map(end => (
                              <React.Fragment key={end}>
                                <td style={cellStyle}>
                                  <DraftNumberInput
                                    aria-label={`${label}: ${end} end DN`}
                                    step="1"
                                    min="1"
                                    displayValue={row[`dn_${end}`]}
                                    onCommit={(text) => handleReducerDn(idx, end, text)}
                                    className="form-input"
                                    style={smallInput('70px')}
                                  />
                                </td>
                                <td style={cellStyle}>
                                  <input
                                    type="text"
                                    aria-label={`${label}: ${end} end NPS`}
                                    value={row[`nps_${end}`] ?? ''}
                                    onChange={(e) => updateRow(idx, r => ({ ...r, [`nps_${end}`]: e.target.value }))}
                                    className="form-input"
                                    style={smallInput('64px')}
                                  />
                                </td>
                                <td style={cellStyle}>
                                  <DraftNumberInput
                                    aria-label={`${label}: ${end} end OD`}
                                    step="any"
                                    min="0"
                                    displayValue={units.lengthOut(row[`od_${end}_mm`])}
                                    onCommit={(text) => {
                                      const v = units.lengthIn(text);
                                      if (v !== null && v > 0) updateRow(idx, r => withConeAngle({ ...r, [`od_${end}_mm`]: round(v, 3) }));
                                    }}
                                    className="form-input"
                                    style={smallInput('80px')}
                                  />
                                </td>
                              </React.Fragment>
                            ))}
                            <td style={cellStyle}>
                              <DraftNumberInput
                                aria-label={`${label}: length`}
                                step="any"
                                min="0"
                                displayValue={units.lengthOut(row.length_mm)}
                                onCommit={(text) => {
                                  const v = units.lengthIn(text);
                                  if (v !== null && v > 0) updateRow(idx, r => withConeAngle({ ...r, length_mm: round(v, 3) }));
                                }}
                                className="form-input"
                                style={smallInput('80px')}
                              />
                            </td>
                            <td style={{ ...cellStyle, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }} title="Calculated from the ODs and the length">
                              {angle > 0 ? `${angle.toFixed(1)}°` : '—'}
                            </td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                              <button aria-label={`Remove ${label.toLowerCase()}`}
                                onClick={() => handleRemoveDimensionRow(idx)}
                                className="btn-danger-ghost"
                                style={{ height: '28px', padding: '0 8px' }}
                                title="Remove size row"
                              >
                                <TrashIcon size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
                        <th style={thStyle}>Nominal size</th>
                        <th style={thStyle}>NPS [in]</th>
                        <th style={thStyle}>OD [{units.length}]</th>
                        {scheduleColumns.map(key => (
                          <th key={key} style={thStyle}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              {scheduleLabel(key)} {isEditing ? `WT [${units.length}]` : '(WT / ID)'}
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveScheduleColumn(key)}
                                  aria-label={`Remove schedule ${scheduleLabel(key)}`}
                                  title={`Remove schedule ${scheduleLabel(key)}`}
                                  className="btn-danger-ghost"
                                  style={{ height: '22px', width: '22px', padding: 0 }}
                                >
                                  <CrossIcon size={10} />
                                </button>
                              )}
                            </span>
                          </th>
                        ))}
                        {isEditing && <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {dims.map((row, idx) => {
                        const schs = row.schedules || {};
                        const isDnOnly = String(row.nps).toUpperCase().startsWith('DN');
                        if (!isEditing) {
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ ...thStyle, fontWeight: '700' }}>DN {row.dn}</td>
                              <td style={{ ...thStyle, color: 'var(--color-text-secondary)' }}>{isDnOnly || !row.nps ? '—' : `${row.nps}"`}</td>
                              <td style={thStyle}>{units.lengthOut(row.od_mm)}</td>
                              {scheduleColumns.map(key => {
                                const entry = schs[key];
                                return (
                                  <td key={key} style={thStyle}>
                                    {entry
                                      ? <span>{units.lengthOut(entry.wt_mm)} / <strong>{units.lengthOut(entry.id_mm)}</strong></span>
                                      : <span style={{ color: 'var(--color-border)' }}>—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        }
                        const label = `DN ${row.dn || `row ${idx + 1}`}`;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                            <td style={cellStyle}>
                              <DraftNumberInput
                                aria-label={`Row ${idx + 1}: DN`}
                                step="1"
                                min="1"
                                displayValue={row.dn}
                                onCommit={(text) => handleScheduleDn(idx, text)}
                                className="form-input"
                                style={smallInput('72px')}
                              />
                            </td>
                            <td style={cellStyle}>
                              <input
                                type="text"
                                aria-label={`${label}: NPS`}
                                value={row.nps ?? ''}
                                onChange={(e) => updateRow(idx, r => ({ ...r, nps: e.target.value }))}
                                className="form-input"
                                style={smallInput('64px')}
                              />
                            </td>
                            <td style={cellStyle}>
                              <DraftNumberInput
                                aria-label={`${label}: outside diameter`}
                                step="any"
                                min="0"
                                displayValue={units.lengthOut(row.od_mm)}
                                onCommit={(text) => {
                                  const v = units.lengthIn(text);
                                  if (v !== null && v > 0) updateRow(idx, r => withInsideDiameters({ ...r, od_mm: round(v, 3) }));
                                }}
                                className="form-input"
                                style={smallInput('80px')}
                              />
                            </td>
                            {scheduleColumns.map(key => {
                              const entry = schs[key];
                              const id = entry ? Number(row.od_mm) - 2 * Number(entry.wt_mm) : null;
                              const invalid = entry && !(id > 0);
                              return (
                                <td key={key} style={cellStyle}>
                                  <DraftNumberInput
                                    aria-label={`${label}: ${scheduleLabel(key)} wall thickness`}
                                    step="any"
                                    min="0"
                                    placeholder="—"
                                    displayValue={entry ? units.lengthOut(entry.wt_mm) : ''}
                                    onCommit={(text) => handleWall(idx, key, text)}
                                    className="form-input"
                                    style={{ ...smallInput('72px'), ...(invalid ? { borderColor: 'var(--color-danger)' } : {}) }}
                                  />
                                  {entry && (
                                    <div style={{ fontSize: 'var(--fs-xs)', marginTop: '2px', color: invalid ? 'var(--color-danger-text)' : 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                      {invalid ? 'WT ≥ OD/2' : <>ID <strong>{units.lengthOut(round(id, 3))}</strong></>}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                              <button aria-label={`Remove ${label}`}
                                onClick={() => handleRemoveDimensionRow(idx)}
                                className="btn-danger-ghost"
                                style={{ height: '28px', padding: '0 8px' }}
                                title="Remove size row"
                              >
                                <TrashIcon size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {dims.length === 0 && (
                <div style={{ textAlign: 'center', padding: '16px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
                  {isEditing
                    ? `No ${isValve ? 'styles' : 'sizes'} yet. Use "${isValve ? 'Add style' : 'Add size'}" to start the table.`
                    : `This ${isValve ? 'catalogue has no styles' : 'standard has no sizes'} yet.`}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '40px', color: 'var(--color-text-secondary)' }}>
            {loading ? 'Loading catalog...' : standards.length === 0
              ? (isValve ? 'There are no control valve style catalogues. Restore the defaults, import a library or create a catalogue.' : 'The fitting catalog is empty. Restore the defaults, import a library or create a standard.')
              : (isValve ? 'Select a catalogue from the left sidebar to view details.' : 'Select a fitting standard from the left sidebar to view details.')}
            {!loading && libraryActions}
          </div>
        )}
      </main>

      {/* CLONE STANDARD MODAL */}
      {isCloneModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(57, 82, 83, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-brand-dark)'
                }}>
                  <CopyIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title">{isValve ? 'Clone Control Valve Catalogue' : 'Clone Fitting Standard'}</h3>
                  <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    Create an editable custom copy of {selectedStandard?.name}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsCloneModalOpen(false)} className="modal-close-btn" aria-label="Close" title="Close">
                <CrossIcon size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor="clone-name" style={fieldLabel}>Name</label>
                <input
                  id="clone-name"
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={cloneName}
                  onChange={(e) => {
                    setCloneName(e.target.value);
                    if (!cloneCodeTouched) setCloneCode(codeFromName(e.target.value));
                  }}
                />
              </div>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-text-secondary)' }}>
                  Advanced: identifier <code>{cloneCode || '—'}</code>
                </summary>
                <div style={{ marginTop: '8px' }}>
                  <label htmlFor="clone-code" style={fieldLabel}>Identifier (referenced by pipe classes and library files)</label>
                  <input
                    id="clone-code"
                    type="text"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={cloneCode}
                    onChange={(e) => { setCloneCode(e.target.value.toUpperCase()); setCloneCodeTouched(true); }}
                  />
                </div>
              </details>
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
      {isNewModalOpen && newStandardData && (
        <div className="modal-overlay">
          <div className="modal-container" ref={modalA11yRef} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(57, 82, 83, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-brand-dark)'
                }}>
                  <PlusIcon size={16} />
                </div>
                <div>
                  <h3 className="modal-title">{isValve ? 'New Control Valve Catalogue' : 'New Fitting Standard'}</h3>
                  <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)' }}>
                    {isValve ? 'Create a catalogue of valve styles, then enter their F_L and F_d values' : 'Create an empty reducer table or pipe schedule matrix, then add its sizes'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="modal-close-btn" aria-label="Close" title="Close">
                <CrossIcon size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor="new-std-name" style={fieldLabel}>Name</label>
                <input
                  id="new-std-name"
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  placeholder="e.g. ISO 5251 Buttweld Reducers"
                  value={newStandardData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setNewStandardData(prev => ({ ...prev, name, code: newCodeTouched ? prev.code : codeFromName(name) }));
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isValve ? '1fr' : '1fr 1fr', gap: '10px' }}>
                {!isValve && <div>
                  <label htmlFor="new-std-type" style={fieldLabel}>Fitting type</label>
                  <select
                    id="new-std-type"
                    className="form-select"
                    style={{ width: '100%', height: '34px' }}
                    value={newStandardData.fitting_type}
                    onChange={(e) => setNewStandardData(prev => ({ ...prev, fitting_type: e.target.value }))}
                  >
                    <option value="reducer">Reducer / Expander</option>
                    <option value="pipe_schedule">Pipe Schedules</option>
                  </select>
                </div>}
                <div>
                  <label htmlFor="new-std-group" style={fieldLabel}>Standard group</label>
                  <select
                    id="new-std-group"
                    className="form-select"
                    style={{ width: '100%', height: '34px' }}
                    value={newStandardData.standard}
                    onChange={(e) => setNewStandardData(prev => ({ ...prev, standard: e.target.value }))}
                  >
                    {groups.map(g => <option key={g} value={g}>{groupLabel(g)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="new-std-description" style={fieldLabel}>Description</label>
                <input
                  id="new-std-description"
                  type="text"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={newStandardData.description}
                  onChange={(e) => setNewStandardData(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-text-secondary)' }}>
                  Advanced: identifier <code>{newStandardData.code || '—'}</code>
                </summary>
                <div style={{ marginTop: '8px' }}>
                  <label htmlFor="new-std-code" style={fieldLabel}>Identifier (referenced by pipe classes and library files)</label>
                  <input
                    id="new-std-code"
                    type="text"
                    className="form-input"
                    style={{ width: '100%' }}
                    value={newStandardData.code}
                    onChange={(e) => { setNewStandardData(prev => ({ ...prev, code: e.target.value.toUpperCase() })); setNewCodeTouched(true); }}
                  />
                </div>
              </details>
            </div>

            <div className="modal-footer">
              <button onClick={() => setIsNewModalOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreateNewStandard} className="btn-primary">
                {isValve ? 'Create Catalogue' : 'Create Standard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FittingStandardsTab;
