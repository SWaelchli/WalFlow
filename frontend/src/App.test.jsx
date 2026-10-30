import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import axios from 'axios';
import { getDialogState, resolveModal } from './utils/dialogs';
import { resetTabIdCache } from './utils/draftStorage';

// Smoke test of the whole app shell: it must mount, load the welcome canvas and show its components.
// (Catches broken hook order or missing wiring after refactors of App.jsx.)
vi.mock('axios', () => {
  const reject = () => Promise.reject({ response: { status: 401 } });
  const ok = (data) => Promise.resolve({ data });
  const get = vi.fn((url) => {
    if (url.includes('/api/auth/status')) return ok({ admin_exists: true });
    if (url.includes('/pipe-classes')) return ok([]);
    return reject();
  });
  const api = { get, post: vi.fn(reject), put: vi.fn(reject), delete: vi.fn(reject), defaults: { headers: { common: {} } }, interceptors: { request: { use: vi.fn(), eject: vi.fn() }, response: { use: vi.fn(), eject: vi.fn() } } };
  return { default: api, ...api };
});

class FakeWebSocket {
  static OPEN = 1;
  constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 3; this.onclose?.({}); }, 0); }
  send() {}
  close() {}
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('DOMMatrixReadOnly', class { constructor() { this.m22 = 1; } });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  it('mounts and loads the welcome canvas', async () => {
    const { default: App } = await import('./App.jsx');
    render(<App />);
    // The navbar's primary action and the welcome canvas's tank both appear
    await waitFor(() => expect(screen.getAllByText(/Run Simulation/i).length).toBeGreaterThan(0), { timeout: 8000 });
  }, 40000);

  it('forwards the old /pipes address to /catalogue', async () => {
    window.history.pushState({}, '', '/pipes');
    try {
      const { default: App } = await import('./App.jsx');
      render(<App />);
      expect(window.location.pathname).toBe('/catalogue');
    } finally {
      window.history.pushState({}, '', '/');
    }
  }, 40000);
});

describe('boot with a local draft older than the cloud copy', () => {
  const tank = (x) => ({ id: 'n1', type: 'tank', position: { x, y: 0 }, data: { label: 'T' } });
  const body = (x, extra = {}) => ({ version: '0.2', nodes: [tank(x)], edges: [], globalSettings: {}, cases: [], ...extra });

  it('choosing the cloud version reads the drawing once and never uploads over it', async () => {
    const user = { id: 'u1', username: 'me', role: 'user' };
    const draft = body(100, {
      timestamp: new Date().toISOString(), active_diagram_id: 'd1', active_diagram_title: 'D',
      base_updated_at: '2026-01-01T00:00:00Z', viewport: { x: 0, y: 0, zoom: 1 },
    });
    sessionStorage.setItem('walflow_tab_id', 'tab1');
    resetTabIdCache();
    localStorage.setItem('walflow_draft_tab1', JSON.stringify(draft));

    const originalGet = axios.get.getMockImplementation();
    axios.get.mockImplementation((url) => {
      if (url.includes('/api/auth/admin-status')) return Promise.resolve({ data: { admin_exists: true } });
      if (url === '/api/auth/me') return Promise.resolve({ data: user });
      if (url === '/api/diagrams/d1') {
        return Promise.resolve({ data: { id: 'd1', title: 'D', description: '', updated_at: '2026-02-01T00:00:00Z', diagram_data: JSON.stringify(body(5)) } });
      }
      if (url.endsWith('/lock-status')) return Promise.resolve({ data: { is_locked: false } });
      return originalGet(url);
    });
    axios.post.mockImplementation((url) => (url.endsWith('/checkout')
      ? Promise.resolve({ data: { status: 'success', lock: { user_id: 'u1', username: 'me' } } })
      : Promise.reject({ response: { status: 401 } })));
    axios.put.mockImplementation(() => Promise.resolve({ data: { updated_at: '2026-03-01T00:00:00Z' } }));

    try {
      const { default: App } = await import('./App.jsx');
      render(<StrictMode><App /></StrictMode>);
      const answered = [];
      // the user picks "Load cloud version" whenever the conflict question is on screen
      await waitFor(() => {
        const modal = getDialogState().modal;
        if (modal) { answered.push(modal.title); act(() => resolveModal(true)); }
        expect(answered).toContain('Newer cloud version');
      }, { timeout: 8000 });
      await act(async () => { await new Promise((r) => setTimeout(r, 4500)); });   // canvas load, then both save debounces

      expect(axios.get.mock.calls.filter(([url]) => url === '/api/diagrams/d1')).toHaveLength(1);
      expect(axios.put).not.toHaveBeenCalled();
      const savedDraft = JSON.parse(localStorage.getItem('walflow_draft_tab1'));
      expect(savedDraft.nodes[0].position.x).toBe(5);
    } finally {
      axios.get.mockImplementation(originalGet);
      axios.post.mockImplementation(() => Promise.reject({ response: { status: 401 } }));
      axios.put.mockImplementation(() => Promise.reject({ response: { status: 401 } }));
    }
  }, 40000);
});
