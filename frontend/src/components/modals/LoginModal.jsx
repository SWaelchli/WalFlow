import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

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
        backgroundColor: '#1A2829',
        color: '#ffffff',
        border: '1px solid #395253',
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
          `}
        </style>

        {/* Header */}
        <div style={{
          padding: '24px 28px 16px 28px',
          borderBottom: '1px solid #263839',
          backgroundColor: '#223233',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              boxShadow: '0 4px 12px rgba(250, 133, 7, 0.3)'
            }}>
              {mode === 'login' ? '🔑' : '👤'}
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
            style={{
              background: 'transparent',
              border: 'none',
              color: '#B8C9C8',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#263839'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#B8C9C8'; }}
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher */}
        <div style={{ display: 'flex', padding: '16px 28px 0 28px', gap: '10px' }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            style={{
              flex: 1,
              padding: '10px',
              border: mode === 'login' ? 'none' : '1px solid #4A6768',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: mode === 'login' ? '#FA8507' : '#263839',
              color: mode === 'login' ? '#FFFFFF' : '#B8C9C8',
              boxShadow: mode === 'login' ? '0 4px 12px rgba(250, 133, 7, 0.3)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            style={{
              flex: 1,
              padding: '10px',
              border: mode === 'register' ? 'none' : '1px solid #4A6768',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              backgroundColor: mode === 'register' ? '#FA8507' : '#263839',
              color: mode === 'register' ? '#FFFFFF' : '#B8C9C8',
              boxShadow: mode === 'register' ? '0 4px 12px rgba(250, 133, 7, 0.3)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {infoMessage && (
            <div style={{
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid #22C55E',
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
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. engineer_alex"
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

          <div style={{ marginBottom: mode === 'register' ? '18px' : '24px' }}>
            <label style={{ display: 'block', color: '#FA8507', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Password
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

          {mode === 'register' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#FA8507', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                Confirm Password
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
          )}

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
            {submitting ? '⌛ Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
