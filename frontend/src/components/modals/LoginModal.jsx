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
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '440px' }}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '24px 28px 16px 28px' }}>
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
              <h3 className="modal-title" style={{ fontSize: '18px' }}>
                {mode === 'login' ? 'Sign In to WalFlow' : 'Create New Account'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
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
            className={`modal-mode-btn ${mode === 'login' ? 'modal-mode-btn-active' : 'modal-mode-btn-inactive'}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`modal-mode-btn ${mode === 'register' ? 'modal-mode-btn-active' : 'modal-mode-btn-inactive'}`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {infoMessage && (
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid var(--color-success)',
              borderRadius: '10px',
              padding: '12px 14px',
              color: 'var(--color-success)',
              fontSize: '13px',
              marginBottom: '18px',
              lineHeight: '1.4'
            }}>
              {infoMessage}
            </div>
          )}

          {error && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid var(--color-danger)',
              borderRadius: '10px',
              padding: '12px 14px',
              color: 'var(--color-danger)',
              fontSize: '13px',
              marginBottom: '18px',
              lineHeight: '1.4'
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
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
                height: '38px',
                fontSize: '14px'
              }}
              required
            />
          </div>

          <div style={{ marginBottom: mode === 'register' ? '18px' : '24px' }}>
            <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
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
                height: '38px',
                fontSize: '14px'
              }}
              required
            />
          </div>

          {mode === 'register' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
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
