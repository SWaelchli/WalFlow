import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { getDialogState, resolveModal, resetDialogs } from './utils/dialogs';
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
  // No test inherits another's draft, tab-alive marker or tab id
  Object.keys(localStorage).filter((k) => k.startsWith('walflow_draft_') || k.startsWith('walflow_tab_alive_')).forEach((k) => localStorage.removeItem(k));
  localStorage.clear();
  sessionStorage.clear();
  resetTabIdCache();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('DOMMatrixReadOnly', class { constructor() { this.m22 = 1; } });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  resetTabIdCache();
  resetDialogs();
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

describe('side pane rail', () => {
  it('the active button collapses the pane and another button opens its pane', async () => {
    const { default: App } = await import('./App.jsx');
    render(<App />);
    const rail = await screen.findByRole('navigation', { name: 'Side panes' }, { timeout: 8000 });
    const btn = (name) => Array.from(rail.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === name);
    expect(btn('Components').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(btn('Components'));
    expect(btn('Components').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn('Settings'));
    expect(btn('Settings').getAttribute('aria-pressed')).toBe('true');
    expect(btn('Components').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  }, 40000);
});

describe('loading an example', () => {
  it('loads without a question while the canvas has no edits', async () => {
    const { default: App } = await import('./App.jsx');
    render(<App />);
    const rail = await screen.findByRole('navigation', { name: 'Side panes' }, { timeout: 8000 });
    fireEvent.click(Array.from(rail.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Examples'));
    const example = await waitFor(() => { expect(document.querySelector('.examples-list button')).toBeTruthy(); }, { timeout: 8000 }).then(() => document.querySelector('.examples-list button'));
    expect(example).toBeTruthy();
    const before = document.querySelectorAll('.react-flow__node').length;
    fireEvent.click(example);
    // the example replaces the welcome canvas without a question
    await waitFor(() => expect(document.querySelectorAll('.react-flow__node').length).not.toBe(before), { timeout: 8000 });
    expect(getDialogState().modal).toBeNull();
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
      // canvas load, then the local-draft debounce writes the chosen cloud copy
      await waitFor(() => expect(JSON.parse(localStorage.getItem('walflow_draft_tab1')).nodes[0]?.position.x).toBe(5), { timeout: 8000 });
      // the cloud debounce (2 s) has to pass before "never uploads" means anything
      await act(async () => { await new Promise((r) => setTimeout(r, 2200)); });

      expect(axios.get.mock.calls.filter(([url]) => url === '/api/diagrams/d1')).toHaveLength(1);
      expect(axios.put).not.toHaveBeenCalled();
    } finally {
      axios.get.mockImplementation(originalGet);
      axios.post.mockImplementation(() => Promise.reject({ response: { status: 401 } }));
      axios.put.mockImplementation(() => Promise.reject({ response: { status: 401 } }));
    }
  }, 40000);
});
