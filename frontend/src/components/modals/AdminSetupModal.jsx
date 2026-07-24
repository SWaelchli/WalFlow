import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

const AdminSetupModal = ({ isOpen, onClose }) => {
  const { setupFirstAdmin } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      await setupFirstAdmin(username.trim(), password);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to complete initial admin setup.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(26, 40, 41, 0.75)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "var(--font-sans, 'Inter', sans-serif)"
    }}>
      <div style={{
        backgroundColor: '#1A2829',
        color: '#ffffff',
        border: '1px solid #395253',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(250, 133, 7, 0.15)',
        overflow: 'hidden',
        animation: 'walflowFadeIn 0.2s ease-out'
      }}>
        <style>
          {`
            @keyframes walflowFadeIn {
              from { opacity: 0; transform: scale(0.97); }
              to { opacity: 1; transform: scale(1); }
            }
          `}
        </style>

        {/* Header */}
        <div style={{
          padding: '24px 28px 18px 28px',
          borderBottom: '1px solid #263839',
          backgroundColor: '#223233'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: '0 4px 12px rgba(250, 133, 7, 0.3)'
            }}>
              👑
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '700' }}>
                First-Time Admin Setup
              </h3>
              <p style={{ margin: '2px 0 0 0', color: '#B8C9C8', fontSize: '12px' }}>
                Initialize system administrator account
              </p>
            </div>
          </div>
          <p style={{ margin: '8px 0 0 0', color: '#D8E2E1', fontSize: '13px', lineHeight: '1.5' }}>
            No administrator user was found in the WalFlow database. Please create the initial Administrator account to secure system access.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {error && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #EF4444',
              borderRadius: '10px',
              padding: '12px 14px',
              color: '#FCA5A5',
              fontSize: '13px',
              marginBottom: '18px',
              lineHeight: '1.4'
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: '#FA8507', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Admin Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '10px',
                border: '1px solid #395253',
                backgroundColor: '#223233',
                color: '#FFFFFF',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#FA8507'}
              onBlur={(e) => e.target.style.borderColor = '#395253'}
              required
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: '#FA8507', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '10px',
                border: '1px solid #395253',
                backgroundColor: '#223233',
                color: '#FFFFFF',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#FA8507'}
              onBlur={(e) => e.target.style.borderColor = '#395253'}
              required
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#FA8507', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Confirm Admin Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '10px',
                border: '1px solid #395253',
                backgroundColor: '#223233',
                color: '#FFFFFF',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#FA8507'}
              onBlur={(e) => e.target.style.borderColor = '#395253'}
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: '700',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(250, 133, 7, 0.35)',
              transition: 'all 0.15s ease'
            }}
          >
            {submitting ? '⌛ Initializing Setup...' : '🚀 Create Admin Account & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminSetupModal;
