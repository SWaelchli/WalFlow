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
  onOpenAuthModal,
  onOpenAdminHub,
  onOpenHelpModal,
  onLogoutClear,
  cases = [],
  activeCaseId = 'case_base',
  onSelectCase,
  onAddCase,
  activeProject,
  activeDiagram
}) {
  const { currentUser, isAuthenticated, isAdmin, adminStatus, logout } = useAuth();

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

          {activeDiagram && (
            <span style={{
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--color-brand-dark)',
              backgroundColor: '#F4F7F6',
              padding: '0 14px',
              height: '34px',
              boxSizing: 'border-box',
              borderRadius: '8px',
              border: '1px solid #D8E2E1',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CloudIcon size={12} color="var(--color-primary)" />
              {activeProject ? `${activeProject.title} / ` : ''}<strong>{activeDiagram.title}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Center: Empty (Moved to Left) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
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
