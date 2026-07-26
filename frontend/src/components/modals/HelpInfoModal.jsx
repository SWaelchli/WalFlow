import React, { useState } from 'react';
import { APP_VERSION, FILE_FORMAT_VERSION } from '../../constants';

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
      { keys: ['Shift', '?'], label: 'Toggle Help & Info screen' },
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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(26, 40, 41, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'walflowFadeIn 0.2s ease-out',
        fontFamily: "var(--font-sans, 'Inter', sans-serif)",
      }}
      onClick={onClose}
    >
      <style>
        {`
          @keyframes walflowFadeIn {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
          }
          .walflow-kbd {
            background: linear-gradient(180deg, #395253 0%, #263839 100%);
            color: #ffffff;
            border: 1px solid #4A6768;
            box-shadow: 0 2px 0 #1A2829;
            border-radius: 6px;
            padding: 3px 8px;
            font-family: var(--font-mono, monospace);
            font-size: 12px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
          }
          .walflow-link-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: 10px;
            background: #263839;
            color: #ffffff;
            border: 1px solid #4A6768;
            text-decoration: none;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
          }
          .walflow-link-btn:hover {
            background: #FA8507;
            border-color: #FA8507;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(250, 133, 7, 0.35);
          }
          .walflow-tab-btn {
            background: transparent;
            border: none;
            color: #B8C9C8;
            font-size: 14px;
            font-weight: 600;
            padding: 10px 16px;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .walflow-tab-btn:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.05);
          }
          .walflow-tab-btn.active {
            color: #ffffff;
            background: #FA8507;
            box-shadow: 0 4px 12px rgba(250, 133, 7, 0.3);
          }
        `}
      </style>

      <div
        style={{
          backgroundColor: '#1A2829',
          color: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #395253',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(250, 133, 7, 0.15)',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px 16px 28px',
            borderBottom: '1px solid #263839',
            backgroundColor: '#223233',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #FA8507 0%, #E07600 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(250, 133, 7, 0.3)',
              }}
            >
              🌊
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#ffffff' }}>
                WalFlow Help & Information
              </h2>
              <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#B8C9C8' }}>
                Real-time Web Hydraulic Simulator
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#B8C9C8',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '8px',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#263839'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#B8C9C8'; }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            padding: '12px 28px',
            backgroundColor: '#1A2829',
            borderBottom: '1px solid #263839',
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            className={`walflow-tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            ⌨️ Keyboard Shortcuts
          </button>
          <button
            className={`walflow-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            📖 User Guide
          </button>
          <button
            className={`walflow-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            💡 About & Copyright
          </button>
        </div>

        {/* Body Content */}
        <div
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
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
                      fontSize: '12px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#FA8507',
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
                      backgroundColor: '#223233',
                      borderRadius: '12px',
                      padding: '14px 18px',
                      border: '1px solid #395253',
                    }}
                  >
                    {group.shortcuts.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justify: 'space-between',
                          alignItems: 'center',
                          padding: '10px 0',
                          borderBottom: idx < group.shortcuts.length - 1 ? '1px solid #263839' : 'none',
                        }}
                      >
                        <span style={{ fontSize: '14px', color: '#D8E2E1', paddingRight: '32px', flex: 1 }}>{item.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexShrink: 0 }}>
                          {item.keys.map((k, kIdx) => (
                            <React.Fragment key={kIdx}>
                              {kIdx > 0 && <span style={{ color: '#587071', fontSize: '12px' }}>+</span>}
                              <kbd className="walflow-kbd">{formatKey(k)}</kbd>
                            </React.Fragment>
                          ))}
                          {item.extraKeys && (
                            <>
                              <span style={{ color: '#587071', fontSize: '12px', margin: '0 4px' }}>or</span>
                              {item.extraKeys.map((k, kIdx) => (
                                <React.Fragment key={kIdx}>
                                  {kIdx > 0 && <span style={{ color: '#587071', fontSize: '12px' }}>+</span>}
                                  <kbd className="walflow-kbd">{formatKey(k)}</kbd>
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
                  backgroundColor: '#223233',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #395253',
                  lineHeight: '1.6',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px 0' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff' }}>
                    About WalFlow
                  </h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ backgroundColor: '#395253', color: '#FA8507', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                      App v{APP_VERSION}
                    </span>
                    <span style={{ backgroundColor: '#395253', color: '#60A5FA', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                      Format v{FILE_FORMAT_VERSION}
                    </span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '14px', color: '#D8E2E1' }}>
                  WalFlow is a full-stack web application designed for building and simulating hydraulic process and instrumentation diagrams (P&IDs) directly in your browser. It pairs a high-performance Python FastAPI physics engine with an interactive ReactFlow drag-and-drop canvas.
                </p>
              </div>

              {/* Author & Links */}
              <div
                style={{
                  backgroundColor: '#223233',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid #395253',
                }}
              >
                <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', color: '#FA8507' }}>
                  Developer & Portfolio Links
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <a
                    href="https://github.com/SWaelchli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="walflow-link-btn"
                  >
                    🐙 GitHub Profile
                  </a>
                  <a
                    href="https://www.linkedin.com/in/sebastian-w%C3%A4lchli-405603227/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="walflow-link-btn"
                  >
                    💼 LinkedIn Profile
                  </a>
                  <a
                    href="https://swaelchli.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="walflow-link-btn"
                  >
                    🌐 Personal Website
                  </a>
                </div>
              </div>

              {/* Copyright Disclaimer */}
              <div
                style={{
                  backgroundColor: '#223233',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px dashed #FA8507',
                }}
              >
                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#FA8507' }}>
                  Copyright & Licensing (WalFlow v{APP_VERSION})
                </h4>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#D8E2E1',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: '1.5',
                  }}
                >
                  WalFlow v{APP_VERSION} (File Format v{FILE_FORMAT_VERSION})<br />
                  Copyright (c) 2026 Sebastian Waelchli (https://swaelchli.com). All rights reserved. Licensed under the PolyForm Noncommercial License.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: EXPANDED USER GUIDE */}
          {activeTab === 'guide' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', lineHeight: '1.6' }}>
              {/* 1. Canvas & Diagram Construction */}
              <div style={{ backgroundColor: '#223233', borderRadius: '12px', padding: '18px 20px', border: '1px solid #395253' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#FA8507', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏗️</span> 1. Canvas & Diagram Construction
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#D8E2E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Drag & Drop Equipment:</strong> Drag pumps (Centrifugal & Volumetric), tanks, control valves, pressure regulators, orifices, filters, heat exchangers, or 3-way TCVs from the left sidebar onto the canvas.</li>
                  <li><strong>Port Wiring:</strong> Connect blue inlet handles (left) to red outlet handles (right) to build hydraulic pipe runs. Drag yellow handles for signal controls.</li>
                  <li><strong>Canvas Shortcuts:</strong> Rotate nodes (`R`), Copy (`Ctrl+C`), Paste (`Ctrl+V`), Duplicate (`Ctrl+D`), Delete (`Delete`), or Select All (`Ctrl+A`).</li>
                </ul>
              </div>

              {/* 2. Global Fluid & Solver Settings */}
              <div style={{ backgroundColor: '#223233', borderRadius: '12px', padding: '18px 20px', border: '1px solid #395253' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#FA8507', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚙️</span> 2. Global Fluid & System Settings
                </h4>
                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#D8E2E1' }}>
                  Expand the <strong>Global Settings</strong> accordion in the left sidebar to configure simulation physical parameters:
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#D8E2E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Fluid Properties:</strong> Select working fluid (Water, ISO VG 46 Oil, Glycol) to automatically apply density and dynamic viscosity models.</li>
                  <li><strong>Environment:</strong> Set ambient temperature (K) and atmospheric reference pressure (Pa).</li>
                  <li><strong>Solver Configuration:</strong> Tune numerical solver method (`hybr`), inner iteration limits, control iterations, and convergence tolerance ($10^{-6}$).</li>
                </ul>
              </div>

              {/* 3. Property Editor & Live Tuning */}
              <div style={{ backgroundColor: '#223233', borderRadius: '12px', padding: '18px 20px', border: '1px solid #395253' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#FA8507', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📝</span> 3. Property Editor & Equipment Parameters
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#D8E2E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Component Selection:</strong> Click any node or pipe on the canvas to inspect its parameters in the <strong>Property Editor</strong> on the right.</li>
                  <li><strong>Parameter Customization:</strong> Adjust pump rated flow rate ($L/min$) & shutoff pressure ($bar$), valve $Cv$ capacity, setpoint pressures ($Pa$), filter clean/terminal pressure drops, or pipe diameter ($m$) and length ($m$).</li>
                  <li><strong>Live Valve Control:</strong> Drag opening % sliders on control valves to observe dynamic flow and pressure redistributions in real time!</li>
                </ul>
              </div>

              {/* 4. Real-Time Telemetry & Performance Stats */}
              <div style={{ backgroundColor: '#223233', borderRadius: '12px', padding: '18px 20px', border: '1px solid #395253' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#FA8507', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📊</span> 4. Simulation Engine, Telemetry & Stats
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#D8E2E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Run Simulation:</strong> Click <strong>Calculate</strong> to send the PFD topology to the Python FastAPI physics solver via WebSocket.</li>
                  <li><strong>Solver Performance Stats:</strong> Inspect total iterations, solver convergence status, residual error, and overall mass/volume balance.</li>
                  <li><strong>Live Telemetry:</strong> View calculated inlet/outlet pressures ($bar$), volumetric flow rates ($L/min$), temperatures ($^\circ C$), and flow velocities ($m/s$).</li>
                  <li><strong>Detail Graphs:</strong> Inspect pump curves, valve characteristic curves, and pressure profile plots in the <strong>Detail Panel</strong>.</li>
                </ul>
              </div>

              {/* 5. Heatmap Visualizations */}
              <div style={{ backgroundColor: '#223233', borderRadius: '12px', padding: '18px 20px', border: '1px solid #395253' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#FA8507', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎨</span> 5. Heatmap Visualizations
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#D8E2E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Toggle Heatmaps:</strong> Click the 🎨 button in the canvas controls bar to overlay thermal gradients onto the pipes.</li>
                  <li><strong>Modes:</strong> Switch between <strong>Pressure Gradient</strong> ($bar$), <strong>Temperature Profile</strong> ($^\circ C$), <strong>Volume Flow</strong> ($l/min$), and <strong>Velocity</strong> ($m/s$).</li>
                  <li><strong>Custom Scale Ranges:</strong> Toggle auto-scaling or manually define custom min/max bounds via the floating Heatmap Legend.</li>
                </ul>
              </div>

              {/* 6. Save, Load & PFD Preset Templates */}
              <div style={{ backgroundColor: '#223233', borderRadius: '12px', padding: '18px 20px', border: '1px solid #395253' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#FA8507', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📁</span> 6. Save, Load & Preset PFD Templates
                </h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#D8E2E1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li><strong>Save & Load .wlf:</strong> Export your PFD model configuration to `walflow-diagram.wlf` or restore previously saved project files (`.wlf` or legacy `.json`). You can also drag and drop `.wlf` files directly onto the canvas.</li>
                  <li><strong>Built-in Templates:</strong> Load pre-configured industrial examples from the top dropdown: *Standard PFD*, *Volumetric Pump*, *PRV System*, *BPR System*, *API 614 LOS*, or *Remote Control Test*.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 28px',
            backgroundColor: '#223233',
            borderTop: '1px solid #263839',
            display: 'flex',
            justify: 'center',
            alignItems: 'center',
            fontSize: '12px',
            color: '#B8C9C8',
          }}
        >
          <span>Press <kbd className="walflow-kbd">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
