import React, { useState, useRef, useCallback } from 'react';
import CanvasContextMenu from '../canvas/CanvasContextMenu';
import walflowLogo from '../../assets/Logo_WalFlow.svg';
import { useAuth } from '../../hooks/useAuth';
import { APP_VERSION, RELEASE_STAGE } from '../../constants';
import StatusChip from './StatusChip';
import { clickableProps } from '../../utils/a11yProps';
import { describeLockState } from '../../utils/lockState';
import { 
  PlusIcon, 
  CloudIcon, 
  ExportIcon, 
  ImportIcon, 
  TrashIcon, 
  CrownIcon, 
  SignOutIcon, 
  SignInIcon, 
  PlayIcon,
  SpinnerIcon,
  HelpIcon,
  FileIcon,
  CaretDownIcon,
} from '../symbols/IconLibrary';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl+';

/** Save state shown next to the document name: a dot colour + a short label. */
function describeSaveState({ saveStatus, isCloudDoc, isLockedByOther, lastSavedTimestamp }) {
  if (isLockedByOther || saveStatus === 'locked') return { dot: '#B45309', label: 'Read-only' };
  if (saveStatus === 'saving_cloud' || saveStatus === 'saving_local') return { dot: '#B45309', label: 'Saving…' };
  if (saveStatus === 'error') return { dot: '#B91C1C', label: 'Not saved' };
  if (saveStatus === 'saved_cloud') return { dot: '#047857', label: lastSavedTimestamp ? `Saved to cloud ${lastSavedTimestamp}` : 'Saved to cloud' };
  return isCloudDoc
    ? { dot: '#587071', label: 'Saved in this browser' }
    : { dot: '#587071', label: 'Draft in this browser' };
}

export default function Navbar({
  onCalculate,
  isSimulating,
  onOpenAuthModal,
  onOpenAdminHub,
  onOpenHelpModal,
  onLogoutClear,
  onNavigateToCatalogue,
  cases = [],
  activeCaseId = 'case_base',
  onSelectCase,
  activeProject,
  activeDiagram,
  saveStatus = 'saved_local',
  lastSavedTimestamp = null,
  isLockedByOther = false,
  lockInfo = null,
  onNewDrawing,
  onOpenDrawing,
  onSave,
  onSaveAs,
  onImportFile,
  onExportFile,
  runStatus = { state: 'idle', label: 'Not run yet', tone: 'neutral' },
  lastRunAt = null,
  findings = { errors: [], warnings: [] },
  statusNotes = [],
  runError = null,
  runErrorDetail = null,
  statusPanelOpen = false,
  onToggleStatusPanel,
  onCloseStatusPanel,
  onSelectFinding
}) {

  const { currentUser, isAuthenticated, isAdmin, adminStatus, logout } = useAuth();
  const fileBtnRef = useRef(null);
  const [fileMenu, setFileMenu] = useState(null); // { x, y } while open
  const closeFileMenu = useCallback(() => {
    setFileMenu(null);
    fileBtnRef.current?.focus();
  }, []);
  const toggleFileMenu = () => {
    if (fileMenu) { setFileMenu(null); return; }
    const rect = fileBtnRef.current.getBoundingClientRect();
    setFileMenu({ x: rect.left, y: rect.bottom + 4 });
  };
  const fileItems = [
    onNewDrawing && { id: 'new', label: 'New drawing…', onSelect: onNewDrawing },
    isAuthenticated && onOpenDrawing && { id: 'open', label: 'Open from cloud…', onSelect: onOpenDrawing },
    { separator: true },
    onSave && { id: 'save', label: 'Save', shortcut: `${MOD}S`, onSelect: onSave },
    onSaveAs && { id: 'saveas', label: 'Save as…', onSelect: onSaveAs },
    { separator: true },
    onImportFile && { id: 'import', label: 'Import .wlf file…', onSelect: onImportFile },
    onExportFile && { id: 'export', label: 'Export .wlf file', onSelect: onExportFile },
  ];
  const saveState = describeSaveState({ saveStatus, isCloudDoc: !!activeDiagram, isLockedByOther, lastSavedTimestamp });

  const lockState = activeDiagram && isAuthenticated ? describeLockState(lockInfo, currentUser ? currentUser.id : null) : null;
  const lockEditing = lockState && lockState.kind === 'mine';

  const handleUserLogout = () => {
    logout();
    if (onLogoutClear) {
      onLogoutClear();
    }
  };



  return (
    <header style={{
      height: '56px',
      minHeight: '56px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #D8E2E1',
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 20,
      position: 'relative',
      boxShadow: '0 1px 3px rgba(57, 82, 83, 0.05)'
    }}>
      {/* Left: Brand Logo (300px aligned) + RUN Simulation & Case Switcher */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '316px', minWidth: '316px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <img {...clickableProps}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            ref={fileBtnRef}
            type="button"
            onClick={toggleFileMenu}
            className="btn-secondary"
            aria-haspopup="menu"
            aria-expanded={!!fileMenu}
            style={{ padding: '0 10px', gap: '4px' }}
          >
            File <CaretDownIcon size={10} />
          </button>
          {fileMenu && (
            <CanvasContextMenu x={fileMenu.x} y={fileMenu.y} items={fileItems} onClose={closeFileMenu} label="File" width={220} />
          )}

          <button
            onClick={onCalculate}
            disabled={isSimulating}
            title="Run hydraulic simulation for the active case"
            className="btn-primary"
            style={{
              padding: '0 18px',
              fontWeight: '750',
              boxShadow: isSimulating ? 'none' : '0 2px 6px var(--color-primary-glow)'
            }}
          >
            {isSimulating ? (
              <>
                <SpinnerIcon size={12} color="var(--color-text-inverse)" />
                Solving…
              </>
            ) : (
              <>
                <PlayIcon size={12} color="#ffffff" />
                Run Simulation
              </>
            )}
          </button>

          {/* Operating Case Switcher Bar (No Lightning Emoji) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#F4F7F6',
            padding: '0 8px',
            height: '34px',
            borderRadius: '8px',
            border: '1px solid #D8E2E1',
            boxSizing: 'border-box'
          }}>
            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', color: '#1C2B2C' }}>
              Case:
            </span>

            <select
              aria-label="Active operating case"
              title="Switch operating case. Add cases in the Operating cases tab below the canvas."
              value={activeCaseId}
              onChange={(e) => onSelectCase && onSelectCase(e.target.value)}
              className="form-select"
              style={{
                height: '24px',
                padding: '0 8px',
                minWidth: '80px'
              }}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.is_base ? ' (base)' : ''}
                </option>
              ))}
            </select>

          </div>

          <div
            title={activeDiagram ? `${activeProject ? `${activeProject.title} / ` : ''}${activeDiagram.title} — ${saveState.label}` : `Local draft — ${saveState.label}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0,
              maxWidth: '280px',
              fontSize: 'var(--fs-sm)',
              color: 'var(--color-text-primary)'
            }}
          >
            {activeDiagram ? <CloudIcon size={14} color="var(--color-text-secondary)" /> : <FileIcon size={14} color="var(--color-text-secondary)" />}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
              <span style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeDiagram
                  ? <>{activeProject && <span style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>{activeProject.title} / </span>}{activeDiagram.title}</>
                  : 'Local draft'}
              </span>
              <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: 'var(--fs-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: saveState.dot, flexShrink: 0 }} />
                {saveState.label}
              </span>
            </div>
          </div>

          {lockState && lockState.kind !== 'free' && (
            <span
              role="status"
              title={lockState.label}
              aria-label={lockState.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minWidth: 0,
                maxWidth: '260px',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: 'var(--fs-xs)',
                fontWeight: '600',
                backgroundColor: lockEditing ? '#ECFDF5' : 'var(--color-warning-bg)',
                color: lockEditing ? '#047857' : 'var(--color-warning-text)',
                border: `1px solid ${lockEditing ? '#A7F3D0' : 'var(--color-warning-border)'}`
              }}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lockState.label}</span>
            </span>
          )}
        </div>
      </div>

      {/* Center: solver status and model checks */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, paddingLeft: '16px' }}>
        <StatusChip
          status={runStatus}
          lastRunAt={lastRunAt}
          errors={findings.errors}
          warnings={findings.warnings}
          notes={statusNotes}
          runError={runError}
          runErrorDetail={runErrorDetail}
          open={statusPanelOpen}
          onToggle={onToggleStatusPanel}
          onClose={onCloseStatusPanel}
          onSelect={onSelectFinding}
        />
      </div>

      {/* Right: Admin Hub & User Auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

        <button
          onClick={onNavigateToCatalogue}
          className="btn-secondary"
          style={{
            height: '34px',
            padding: '0 12px',
            borderRadius: '8px',
            fontSize: 'var(--fs-sm)',
            fontWeight: '700'
          }}
          title="Open the catalogue: pipe classes, fitting standards and control valve styles"
        >
          Catalogue
        </button>

        <button
          type="button"
          onClick={() => onOpenHelpModal && onOpenHelpModal('guide')}
          className="btn-secondary"
          style={{ height: '34px', padding: '0 12px', borderRadius: '8px', fontSize: 'var(--fs-sm)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
          title="Help, user guide and model limits (Shift + ?)"
        >
          <HelpIcon size={14} />
          Help
        </button>

        {isAdmin && (
          <button
            onClick={onOpenAdminHub}
            className="btn-secondary"
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
                onClick={handleUserLogout}
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
  );
}
