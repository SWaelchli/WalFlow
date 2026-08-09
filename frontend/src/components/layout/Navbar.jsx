import React from 'react';
import walflowLogo from '../../assets/Logo_WalFlow.svg';
import { useAuth } from '../../hooks/useAuth';
import { APP_VERSION, RELEASE_STAGE } from '../../constants';
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
  SpinnerIcon
} from '../symbols/IconLibrary';

export default function Navbar({
  onCalculate,
  isSimulating,
  onSave,
  onLoad,
  onClear,
  onOpenAuthModal,
  onOpenProjectsModal,
  onOpenAdminHub,
  onOpenHelpModal,
  onLogoutClear,
  cases = [],
  activeCaseId = 'case_base',
  onSelectCase,
  onAddCase,
  activeProject,
  saveStatus = 'saved_local',
  lastSavedTimestamp
}) {
  const { currentUser, isAuthenticated, isAdmin, adminStatus, logout } = useAuth();

  const handleUserLogout = () => {
    logout();
    if (onLogoutClear) {
      onLogoutClear();
    }
  };

  const dividerStyle = {
    height: '24px',
    width: '1px',
    backgroundColor: '#EBF0EF',
    margin: '0 4px'
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onCalculate}
            disabled={isSimulating}
            title="Run hydraulic simulation for the active case (Ctrl + Enter)"
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
                Simulating...
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
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#1C2B2C' }}>
              Case:
            </span>

            <select
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
                  {c.name} {c.is_base ? ' (Base)' : ''}
                </option>
              ))}
            </select>

            <button
              onClick={onAddCase}
              title="Duplicate Active Case to create a New Case"
              className="btn-secondary"
              style={{
                height: '24px',
                padding: '0 8px',
                borderRadius: '6px'
              }}
            >
              <PlusIcon size={10} />
              New Case
            </button>
          </div>
        </div>
      </div>

      {/* Center: Main Canvas & Cloud Project Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={dividerStyle} />

        {/* Unified Cloud Projects & Auto-Save Control */}
        <button
          onClick={() => {
            if (isAuthenticated) {
              onOpenProjectsModal();
            } else {
              onOpenAuthModal();
            }
          }}
          title={
            saveStatus === 'saved_cloud'
              ? `Auto-saved to Cloud DB project "${activeProject?.title}". Click to open Cloud Projects manager.`
              : saveStatus === 'saving_cloud'
              ? 'Syncing changes to Cloud DB project...'
              : saveStatus === 'saved_local'
              ? `Cached in local browser storage (${lastSavedTimestamp ? `Saved ${lastSavedTimestamp}` : 'Up to date'}). Click to save or manage Cloud Projects.`
              : saveStatus === 'saving_local'
              ? 'Saving draft to browser storage...'
              : 'Sync error. Click to retry manual save or open Cloud Projects.'
          }
          className="btn-secondary"
          style={{
            backgroundColor:
              saveStatus === 'error'
                ? '#FEF2F2'
                : saveStatus.includes('saving')
                ? '#FFFBEB'
                : '#F4F7F6',
            border:
              saveStatus === 'error'
                ? '1px solid #FEE2E2'
                : saveStatus.includes('saving')
                ? '1px solid #FCD34D'
                : activeProject
                ? '1px solid var(--color-primary)'
                : '1px solid #D8E2E1',
            color:
              saveStatus === 'error'
                ? '#EF4444'
                : saveStatus.includes('saving')
                ? '#D97706'
                : '#1C2B2C'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <div style={{
              width: '6px',
              height: '6px',
              minWidth: '6px',
              minHeight: '6px',
              borderRadius: '50%',
              backgroundColor:
                saveStatus === 'error'
                  ? '#EF4444'
                  : saveStatus.includes('saving')
                  ? '#F59E0B'
                  : '#10B981',
              boxShadow: saveStatus.includes('saving') ? '0 0 6px #F59E0B' : 'none',
              flexShrink: 0
            }} />
            <CloudIcon size={14} style={{ display: 'block' }} />
          </div>

          {saveStatus === 'saved_cloud' ? (
            <span>Cloud: <strong>{activeProject?.title}</strong></span>
          ) : saveStatus === 'saving_cloud' ? (
            <span>Saving to cloud...</span>
          ) : saveStatus === 'saving_local' ? (
            <span>Saving draft...</span>
          ) : saveStatus === 'error' ? (
            <span>Sync Error</span>
          ) : (
            <span>Cloud Projects {isAuthenticated ? '' : '(Login)'}</span>
          )}
        </button>

        <button
          onClick={onSave}
          className="btn-secondary"
        >
          <ExportIcon size={12} />
          Export
        </button>

        <button
          onClick={() => document.getElementById('navbar-file-upload').click()}
          className="btn-secondary"
        >
          <ImportIcon size={12} />
          Import
        </button>

        <input
          id="navbar-file-upload"
          type="file"
          style={{ display: 'none' }}
          accept=".wlf,.json"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  const parsed = JSON.parse(event.target.result);
                  onLoad(parsed, file.name);
                } catch {
                  alert('Failed to load project file. Please ensure it is a valid .wlf or .json file.');
                }
              };
              reader.readAsText(file);
            }
            e.target.value = '';
          }}
        />

        <button
          onClick={onClear}
          className="btn-danger-ghost"
        >
          <TrashIcon size={12} />
          Clear Canvas
        </button>

        <div style={dividerStyle} />
      </div>

      {/* Right: Admin Hub & User Auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

        {isAdmin && (
          <button
            onClick={onOpenAdminHub}
            className="btn-secondary"
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
                onClick={handleUserLogout}
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
  );
}
