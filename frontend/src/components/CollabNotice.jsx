// Non-blocking notice for co-editing events (a co-editor saved, a save was refused, the lock was released).
// Replaces the blocking window.confirm / alert dialogs (F2-11).
export default function CollabNotice({ notice, onDismiss }) {
  if (!notice) return null;
  const canReload = notice.kind === 'diagram_updated' || notice.kind === 'stale';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(560px, calc(100vw - 32px))',
        backgroundColor: '#FFFFFF',
        color: '#1C2B2C',
        border: '1px solid #D8E2E1',
        borderLeft: '4px solid #FA8507',
        borderRadius: '12px',
        padding: '12px 14px',
        fontSize: '13px',
        lineHeight: 1.4,
        boxShadow: '0 10px 25px rgba(28, 43, 44, 0.18)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ flex: 1 }}>{notice.message}</span>
      {canReload && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            backgroundColor: '#395253', color: '#FFFFFF', border: 'none', borderRadius: '8px',
            padding: '6px 12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Reload
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        style={{
          backgroundColor: '#F4F7F6', color: '#1C2B2C', border: '1px solid #D8E2E1', borderRadius: '8px',
          padding: '6px 10px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
