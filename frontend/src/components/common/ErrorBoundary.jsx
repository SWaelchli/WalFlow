import React from 'react';
import { confirmDialog } from '../../utils/dialogs';
import { readDraft, removeDraft } from '../../utils/draftStorage';

const buttonStyle = {
  background: '#F4F7F6', border: '1px solid #D8E2E1', borderRadius: '8px', color: '#1C2B2C',
  padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
};

/**
 * F2-10: a render error no longer leaves a white screen. The user can reload (the last local draft is
 * restored), save the draft as a file, or discard the draft if it is what crashes the app.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  exportDraft = () => {
    const raw = readDraft();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'walflow-draft-recovered.wlf';
    link.click();
    URL.revokeObjectURL(url);
  };

  discardDraftAndReload = async () => {
    const ok = await confirmDialog({
      title: 'Discard local draft?',
      message: 'Discard the local draft and reload? Export it first if you want to keep it.',
      confirmLabel: 'Discard and reload',
      danger: true,
    });
    if (!ok) return;
    removeDraft();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const hasDraft = readDraft() != null;
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F7F6', color: '#1C2B2C', padding: '16px' }}>
        <div style={{ maxWidth: 520, background: '#FFFFFF', border: '1px solid #D8E2E1', borderRadius: 12, padding: 24 }}>
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: '#587071', margin: '0 0 12px' }}>
            WalFlow hit an unexpected error and could not draw this screen. {hasDraft ? 'Your last local draft is still stored in this browser.' : 'No local draft is stored in this browser.'}
          </p>
          <pre style={{ fontSize: 11, background: '#F4F7F6', border: '1px solid #EBF0EF', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap', margin: '0 0 16px' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...buttonStyle, background: '#395253', borderColor: '#395253', color: '#FFFFFF' }} onClick={() => window.location.reload()}>
              Reload{hasDraft ? ' and restore last draft' : ''}
            </button>
            {hasDraft && <button type="button" style={buttonStyle} onClick={this.exportDraft}>Export draft as file</button>}
            {hasDraft && (
              <button type="button" style={{ ...buttonStyle, background: '#FEF2F2', borderColor: '#FEE2E2', color: 'var(--color-danger-text)' }} onClick={this.discardDraftAndReload}>
                Discard draft and reload
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
