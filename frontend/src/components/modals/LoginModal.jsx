import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { SignInIcon, UserIcon, CrossIcon } from '../symbols/IconLibrary';

const LoginModal = ({ isOpen, onClose }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [infoMessage, setInfoMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        onClose();
      } else {
        const res = await register(username.trim(), password);
        if (res && res.status === 'pending_approval') {
          setInfoMessage('🎉 Registration submitted! Your account is pending Administrator approval before you can log in.');
          setMode('login');
          setConfirmPassword('');
        } else {
          setUsername('');
          setPassword('');
          setConfirmPassword('');
          onClose();
        }
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Authentication failed. Please check credentials.';
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
        backgroundColor: 'var(--color-brand-darkest)',
        color: '#ffffff',
        border: '1px solid var(--color-brand-dark)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '440px',
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
            .mode-switch-btn {
              flex: 1;
              padding: 10px;
              border-radius: 10px;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.15s ease;
              outline: none;
            }
            .mode-switch-btn-active {
              border: none;
              background-color: var(--color-primary);
              color: var(--color-text-inverse);
              box-shadow: 0 4px 12px var(--color-primary-glow);
            }
            .mode-switch-btn-inactive {
              border: 1px solid var(--color-brand-light);
              background-color: var(--color-brand-darker);
              color: var(--color-text-muted);
            }
            .mode-switch-btn-inactive:hover {
              background-color: var(--color-brand-light);
              color: var(--color-text-inverse);
            }
            .modal-close-btn {
              background: transparent;
              border: none;
              color: var(--color-text-muted);
              cursor: pointer;
              padding: 4px 8px;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.15s ease;
            }
            .modal-close-btn:hover {
              background-color: var(--color-brand-darker);
              color: var(--color-text-inverse);
            }
          `}
        </style>

        {/* Header */}
        <div style={{
          padding: '24px 28px 16px 28px',
          borderBottom: '1px solid var(--color-brand-darker)',
          backgroundColor: 'var(--color-surface-dark)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px var(--color-primary-glow)'
            }}>
              {mode === 'login' ? <SignInIcon size={20} color="#ffffff" /> : <UserIcon size={20} color="#ffffff" /> }
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: '700' }}>
                {mode === 'login' ? 'Sign In to WalFlow' : 'Create New Account'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#B8C9C8' }}>
                {mode === 'login' ? 'Access your cloud hydraulic diagrams' : 'Register for access approval'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close"
          >
            <CrossIcon size={18} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div style={{ display: 'flex', padding: '16px 28px 0 28px', gap: '10px' }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`mode-switch-btn ${mode === 'login' ? 'mode-switch-btn-active' : 'mode-switch-btn-inactive'}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`mode-switch-btn ${mode === 'register' ? 'mode-switch-btn-active' : 'mode-switch-btn-inactive'}`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {infoMessage && (
            <div style={{
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid var(--color-success)',
              borderRadius: '10px',
              padding: '12px 14px',
              color: '#86EFAC',
              fontSize: '13px',
              marginBottom: '18px',
              lineHeight: '1.4'
            }}>
              {infoMessage}
            </div>
          )}

          {error && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--color-danger)',
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
            <label style={{ display: 'block', color: 'var(--color-primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. engineer_alex"
              className="form-input"
              style={{
                width: '100%',
                backgroundColor: 'var(--color-surface-dark)',
                borderColor: 'var(--color-brand-dark)',
                color: 'var(--color-text-inverse)',
                height: '38px',
                fontSize: '14px'
              }}
              required
            />
          </div>

          <div style={{ marginBottom: mode === 'register' ? '18px' : '24px' }}>
            <label style={{ display: 'block', color: 'var(--color-primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="form-input"
              style={{
                width: '100%',
                backgroundColor: 'var(--color-surface-dark)',
                borderColor: 'var(--color-brand-dark)',
                color: 'var(--color-text-inverse)',
                height: '38px',
                fontSize: '14px'
              }}
              required
            />
          </div>

          {mode === 'register' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--color-primary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--color-surface-dark)',
                  borderColor: 'var(--color-brand-dark)',
                  color: 'var(--color-text-inverse)',
                  height: '38px',
                  fontSize: '14px'
                }}
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '700',
              boxShadow: '0 4px 14px var(--color-primary-glow)'
            }}
          >
            {submitting ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
