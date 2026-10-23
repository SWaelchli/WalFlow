import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

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
});
