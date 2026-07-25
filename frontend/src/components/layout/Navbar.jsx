import React from 'react';
import walflowLogo from '../../assets/Logo_WalFlow.svg';
import { useAuth } from '../../hooks/useAuth';

const theme = {
  primary: '#FA8507',
  primaryHover: '#E07600',
  brandDark: '#395253',
  slate50: '#F4F7F6',
  slate100: '#EBF0EF',
  slate200: '#D8E2E1',
  slate500: '#587071',
  slate800: '#1C2B2C',
  white: '#ffffff',
  danger: '#EF4444',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FEE2E2'
};

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
  onAddCase
}) {
  const { currentUser, isAuthenticated, isAdmin, adminStatus, logout } = useAuth();

  const handleUserLogout = () => {
    logout();
    if (onLogoutClear) {
      onLogoutClear();
    }
  };

  const btnBaseStyle = {
    height: '34px',
    padding: '0 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box'
  };

  const btnSecondaryStyle = {
    ...btnBaseStyle,
    background: theme.slate50,
    border: `1px solid ${theme.slate200}`,
    color: theme.slate800
  };

  return (
    <header style={{
      height: '56px',
      minHeight: '56px',
      backgroundColor: theme.white,
      borderBottom: `1px solid ${theme.slate200}`,
      padding: '0 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 20,
      position: 'relative',
      boxShadow: '0 1px 3px rgba(57, 82, 83, 0.05)'
    }}>
      {/* Left: Brand Logo & Case Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <img
          src={walflowLogo}
          alt="WälFlow Logo"
          onClick={() => onOpenHelpModal && onOpenHelpModal('about')}
          title="Click for Help & Documentation"
          style={{ height: '28px', display: 'block', cursor: 'pointer' }}
        />

        {/* Operating Case Switcher Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: theme.slate50,
          padding: '4px 10px',
          borderRadius: '8px',
          border: `1px solid ${theme.slate200}`
        }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: theme.slate800, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ color: theme.primary }}>⚡</span> Case:
          </span>

          <select
            value={activeCaseId}
            onChange={(e) => onSelectCase && onSelectCase(e.target.value)}
            style={{
              height: '26px',
              padding: '0 8px',
              fontSize: '12px',
              fontWeight: '600',
              color: theme.slate800,
              background: theme.white,
              border: `1px solid ${theme.slate200}`,
              borderRadius: '6px',
              cursor: 'pointer',
              outline: 'none'
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
            style={{
              height: '26px',
              padding: '0 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              background: theme.white,
              border: `1px solid ${theme.slate200}`,
              color: theme.slate800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = theme.slate100}
            onMouseLeave={(e) => e.currentTarget.style.background = theme.white}
          >
            ➕ New Case
          </button>
        </div>
      </div>

      {/* Center: Main Canvas Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onCalculate}
          disabled={isSimulating}
          style={{
            ...btnBaseStyle,
            padding: '0 18px',
            background: isSimulating ? theme.slate200 : theme.primary,
            color: theme.white,
            border: 'none',
            fontSize: '12px',
            fontWeight: '700',
            boxShadow: isSimulating ? 'none' : '0 2px 6px rgba(250, 133, 7, 0.3)'
          }}
          onMouseEnter={(e) => !isSimulating && (e.currentTarget.style.background = theme.primaryHover)}
          onMouseLeave={(e) => !isSimulating && (e.currentTarget.style.background = theme.primary)}
        >
          {isSimulating ? '⌛ Simulating...' : '▶ Run Simulation'}
        </button>

        <button
          onClick={onSave}
          style={btnSecondaryStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.slate100}
          onMouseLeave={(e) => e.currentTarget.style.background = theme.slate50}
        >
          💾 Export
        </button>

        <button
          onClick={() => document.getElementById('navbar-file-upload').click()}
          style={btnSecondaryStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.slate100}
          onMouseLeave={(e) => e.currentTarget.style.background = theme.slate50}
        >
          📂 Import
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
                  onLoad(parsed);
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
          style={{
            ...btnBaseStyle,
            background: 'transparent',
            border: `1px solid ${theme.dangerBorder}`,
            color: theme.danger
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.dangerBg}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          🗑️ Clear Canvas
        </button>
      </div>

      {/* Right: Cloud Projects, Admin Hub & User Auth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => {
            if (isAuthenticated) {
              onOpenProjectsModal();
            } else {
              onOpenAuthModal();
            }
          }}
          style={btnSecondaryStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.slate100}
          onMouseLeave={(e) => e.currentTarget.style.background = theme.slate50}
        >
          ☁️ Cloud Projects {isAuthenticated ? '' : '(Login)'}
        </button>

        {isAdmin && (
          <button
            onClick={onOpenAdminHub}
            style={btnSecondaryStyle}
            onMouseEnter={(e) => e.currentTarget.style.background = theme.slate100}
            onMouseLeave={(e) => e.currentTarget.style.background = theme.slate50}
          >
            👑 Admin Hub
            {adminStatus?.pendingCount > 0 && (
              <span style={{
                backgroundColor: theme.primary,
                color: theme.white,
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
          background: theme.slate50,
          border: `1px solid ${theme.slate200}`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          boxSizing: 'border-box'
        }}>
          {isAuthenticated ? (
            <>
              <span style={{
                fontSize: '12px',
                fontWeight: '700',
                color: isAdmin ? theme.primary : theme.slate800,
                whiteSpace: 'nowrap'
              }}>
                {isAdmin ? '👑' : '👤'} {currentUser?.username}
              </span>

              <button
                onClick={handleUserLogout}
                title="Sign Out"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.danger,
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  padding: '2px 4px',
                  borderRadius: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.dangerBg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span>🚪</span> Log Out
              </button>
            </>
          ) : (
            <button
              onClick={onOpenAuthModal}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.primary,
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              🔒 Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
