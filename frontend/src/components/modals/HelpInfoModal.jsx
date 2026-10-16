import React, { useState } from 'react';
import { APP_VERSION, RELEASE_STAGE, FILE_FORMAT_VERSION } from '../../constants';
import { InfoIcon, CrossIcon, KeyboardIcon, BookIcon } from '../symbols/IconLibrary';

import { GUIDE_SECTIONS, MODEL_SECTIONS } from './helpContent';
import { modalA11yRef } from '../../hooks/useModalA11y';
const SHORTCUT_GROUPS = [
  {
    title: 'Selection & Manipulation',
    shortcuts: [
      { keys: ['Ctrl', 'C'], label: 'Copy selected node(s) & connected edges' },
      { keys: ['Ctrl', 'V'], label: 'Paste copied elements with spatial offset' },
      { keys: ['Ctrl', 'D'], label: 'Duplicate selected elements instantly' },
      { keys: ['Delete'], extraKeys: ['Backspace'], label: 'Delete selected nodes or edges' },
      { keys: ['Ctrl', 'A'], label: 'Select all nodes on canvas' },
      { keys: ['R'], label: 'Rotate selected node 90° clockwise' },
      { keys: ['Esc'], label: 'Deselect all canvas items' },
    ],
  },
  {
    title: 'History & Canvas',
    shortcuts: [
      { keys: ['Ctrl', 'S'], label: 'Manual save session draft or cloud project' },
      { keys: ['Ctrl', 'Z'], label: 'Undo previous canvas action' },
      { keys: ['Ctrl', 'Y'], extraKeys: ['Ctrl', 'Shift', 'Z'], label: 'Redo canvas action' },
      { keys: ['Shift', '?'], label: 'Open this Help screen (Esc closes it)' },
    ],
  },
];

export default function HelpInfoModal({ isOpen, onClose, initialTab = 'shortcuts' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync activeTab when modal transitions from closed to open or initialTab changes
  const [prevIsOpen, setPrevIsOpen] = useState(false);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);

  if (isOpen !== prevIsOpen || (isOpen && initialTab !== prevInitialTab)) {
    setPrevIsOpen(isOpen);
    setPrevInitialTab(initialTab);
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }

  if (!isOpen) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';
  const formatKey = (key) => (key === 'Ctrl' ? modKey : key);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-container"
        ref={modalA11yRef}
        style={{
          maxWidth: '880px',
          maxHeight: '85vh',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px var(--color-primary-glow)',
              }}
            >
              <InfoIcon size={20} color="#ffffff" />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: 'var(--fs-xl)' }}>
                WalFlow Help & Information
              </h2>
              <p style={{ margin: '3px 0 0 0', fontSize: 'var(--fs-base)', color: 'var(--color-text-secondary)' }}>
                Real-time Web Hydraulic Simulator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            style={{ padding: '6px 10px' }}
            title="Close"
            aria-label="Close help"
          >
            <CrossIcon size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            padding: '12px 28px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            className={`modal-tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            <KeyboardIcon size={14} /> Keyboard Shortcuts
          </button>
          <button
            className={`modal-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            <BookIcon size={14} /> User Guide
          </button>
          <button
            className={`modal-tab-btn ${activeTab === 'model' ? 'active' : ''}`}
            onClick={() => setActiveTab('model')}
          >
            <InfoIcon size={14} /> Model & Limits
          </button>
          <button
            className={`modal-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            <InfoIcon size={14} /> About & Copyright
          </button>
        </div>

        {/* Body Content */}
        <div
          className="modal-body"
          style={{
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* TAB 1: SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {SHORTCUT_GROUPS.map((group, groupIdx) => (
                <div key={groupIdx}>
                  <h3
                    style={{
                      fontSize: 'var(--fs-sm)',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-primary-text)',
                      marginBottom: '12px',
                      marginTop: 0,
                    }}
                  >
                    {group.title}
                  </h3>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      backgroundColor: 'var(--color-surface-hover)',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {group.shortcuts.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 0',
                          borderBottom: idx < group.shortcuts.length - 1 ? '1px solid var(--color-border)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: 'var(--fs-md)', color: 'var(--color-text-secondary)', paddingRight: '32px', flex: 1 }}>{item.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexShrink: 0 }}>
                          {item.keys.map((k, kIdx) => (
                            <React.Fragment key={kIdx}>
                              {kIdx > 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)' }}>+</span>}
                              <kbd className="modal-kbd">{formatKey(k)}</kbd>
                            </React.Fragment>
                          ))}
                          {item.extraKeys && (
                            <>
                              <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)', margin: '0 4px' }}>or</span>
                              {item.extraKeys.map((k, kIdx) => (
                                <React.Fragment key={kIdx}>
                                  {kIdx > 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--fs-sm)' }}>+</span>}
                                  <kbd className="modal-kbd">{formatKey(k)}</kbd>
                                </React.Fragment>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: ABOUT & COPYRIGHT */}
          {activeTab === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid var(--color-border)',
                  lineHeight: '1.6',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px 0' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', color: 'var(--color-text-primary)' }}>
                    About WalFlow
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ backgroundColor: 'var(--color-bg-canvas)', border: '1px solid var(--color-border)', color: 'var(--color-primary-text)', padding: '3px 8px', borderRadius: '6px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
                      App v{APP_VERSION}
                    </span>
                    <span style={{ backgroundColor: 'var(--color-bg-canvas)', border: '1px solid var(--color-border)', color: '#0284C7', padding: '3px 8px', borderRadius: '6px', fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
                      Format v{FILE_FORMAT_VERSION}
                    </span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 'var(--fs-md)', color: 'var(--color-text-secondary)' }}>
                  WalFlow is a full-stack web application designed for building and simulating hydraulic process and instrumentation diagrams (P&IDs) directly in your browser. It pairs a high-performance Python FastAPI physics engine with an interactive ReactFlow drag-and-drop canvas.
                </p>
              </div>

              {/* Author & Links */}
              <div
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid var(--color-border)',
                }}
              >
                <h3 style={{ margin: '0 0 14px 0', fontSize: 'var(--fs-lg)', color: 'var(--color-primary-text)' }}>
                  Developer & Portfolio Links
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <a
                    href="https://github.com/SWaelchli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-link-btn"
                  >
                    GitHub Profile
                  </a>
                  <a
                    href="https://www.linkedin.com/in/sebastian-w%C3%A4lchli-405603227/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-link-btn"
                  >
                    LinkedIn Profile
                  </a>
                  <a
                    href="https://swaelchli.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-link-btn"
                  >
                    Personal Website
                  </a>
                </div>
              </div>

              {/* Copyright Disclaimer */}
              <div
                style={{
                  backgroundColor: 'var(--color-surface-hover)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px dashed var(--color-primary)',
                }}
              >
                <h4 style={{ margin: '0 0 8px 0', fontSize: 'var(--fs-base)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary-text)' }}>
                  Copyright & Licensing (WalFlow v{APP_VERSION}{RELEASE_STAGE ? ` ${RELEASE_STAGE}` : ''})
                </h4>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--fs-base)',
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: '1.5',
                  }}
                >
                  WalFlow v{APP_VERSION} {RELEASE_STAGE ? `(${RELEASE_STAGE})` : ''} (File Format v{FILE_FORMAT_VERSION})<br />
                  Copyright (c) 2026 Sebastian Waelchli (https://swaelchli.com). All rights reserved. Licensed under the PolyForm Noncommercial License.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: USER GUIDE and TAB 4: MODEL & LIMITS */}
          {(activeTab === 'guide' || activeTab === 'model') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', lineHeight: '1.6' }}>
              {(activeTab === 'guide' ? GUIDE_SECTIONS : MODEL_SECTIONS).map((section) => (
                <section key={section.title} style={{ backgroundColor: 'var(--color-surface-hover)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--color-border)' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: 'var(--fs-lg)', color: 'var(--color-primary-text)' }}>{section.title}</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: 'var(--fs-base)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {section.items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="modal-footer"
          style={{
            justifyContent: 'center',
            fontSize: 'var(--fs-sm)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>Press <kbd className="modal-kbd">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
