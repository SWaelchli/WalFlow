import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import axios from 'axios';
import { useAutoSaveSession } from './useAutoSaveSession';

vi.mock('axios');
vi.mock('./useAuth', () => ({ useAuth: () => ({ currentUser: { id: 'u1', username: 'me' } }) }));

const node = (id, x = 0) => ({ id, type: 'tank', position: { x, y: 0 }, data: { label: id } });
const diagram = { id: 'd1', title: 'D', description: '', updated_at: '2026-01-01T00:00:00' };

const baseProps = (over = {}) => ({
  nodes: [node('a')], edges: [], globalSettings: {}, cases: [], activeCaseId: 'case_base',
  reactFlowInstance: null, isAuthenticated: true, activeProject: null, activeDiagram: diagram,
  setActiveDiagram: vi.fn(), ...over,
});

async function mount(props = baseProps()) {
  const view = renderHook((p) => useAutoSaveSession(p), { initialProps: props });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });   // lock-status answer: this user holds the lock
  return view;
}

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(2500); });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  axios.get = vi.fn().mockResolvedValue({ data: { is_locked: true, lock: { user_id: 'u1', username: 'me' } } });
  axios.put = vi.fn().mockResolvedValue({ data: { updated_at: '2026-01-01T00:00:05' } });
});
afterEach(() => { vi.useRealTimers(); });

describe('cloud autosave', () => {
  it('sends the loaded version, then the version of the previous save', async () => {
    const { rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await settle();
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(axios.put.mock.calls[0][1].base_updated_at).toBe('2026-01-01T00:00:00');
    expect(axios.put.mock.calls[0][2].headers['X-Walflow-Client-Id']).toBeTruthy();

    rerender(baseProps({ nodes: [node('a', 20)] }));
    await settle();
    expect(axios.put).toHaveBeenCalledTimes(2);
    expect(axios.put.mock.calls[1][1].base_updated_at).toBe('2026-01-01T00:00:05');
  });

  it('does not save again when only the object identity changed', async () => {
    const { rerender } = await mount();
    rerender(baseProps({ nodes: [node('a')] }));   // same content as when the diagram was opened
    await settle();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('shows a notice instead of overwriting when the diagram changed elsewhere', async () => {
    axios.put = vi.fn().mockRejectedValue({ response: { status: 409, headers: { 'x-walflow-conflict': 'stale' }, data: {} } });
    const { result, rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await settle();
    expect(result.current.collabNotice.kind).toBe('stale');
    expect(result.current.saveStatus).toBe('error');
  });
});

describe('edits right after a drawing becomes active', () => {
  it('saves an edit made within a second of the drawing opening', async () => {
    const { rerender } = await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await settle();
    expect(axios.put).toHaveBeenCalledTimes(1);
    expect(axios.put.mock.calls[0][1].diagram_data).toContain('"x":10');
  });

  it('markLoaded: content equal to the loaded server copy is not saved', async () => {
    const { result, rerender } = await mount();
    const serverData = { nodes: [node('a', 7)], edges: [], active_diagram_id: 'd1' };
    act(() => { result.current.markLoaded(serverData); });
    rerender(baseProps({ nodes: [node('a', 7)], edges: [] }));
    await settle();
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('automatic checkout', () => {
  const free = { data: { is_locked: false } };
  const other = { data: { is_locked: true, lock: { user_id: 'u2', username: 'alex' } } };

  it.each([
    ['lock free: checks out and holds the lock', free, true, true, { hasLock: true, isLockedByOther: false }],
    ['lock held by another user: no checkout', other, true, false, { hasLock: false, isLockedByOther: true }],
    ['not authenticated: no checkout', free, false, false, { hasLock: false, isLockedByOther: false }],
  ])('%s', async (_name, lockStatus, isAuthenticated, expectPost, expected) => {
    axios.get = vi.fn().mockResolvedValue(lockStatus);
    axios.post = vi.fn().mockResolvedValue({ data: { status: 'success', lock: { user_id: 'u1', username: 'me' } } });
    const { result } = await mount(baseProps({ isAuthenticated }));
    await settle();
    if (expectPost) {
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.post.mock.calls[0][0]).toBe('/api/diagrams/d1/checkout');
    } else {
      expect(axios.post).not.toHaveBeenCalled();
    }
    expect(result.current.hasLock).toBe(expected.hasLock);
    expect(result.current.isLockedByOther).toBe(expected.isLockedByOther);
  });
});

describe('checkout after a drawing switch', () => {
  it('drops a late checkout result of the previous drawing and releases that lock', async () => {
    let resolveCheckout;
    axios.get = vi.fn((url) => Promise.resolve(url.includes('/d2/')
      ? { data: { is_locked: true, lock: { user_id: 'u2', username: 'alex' } } }
      : { data: { is_locked: false } }));
    axios.post = vi.fn((url) => (url.endsWith('/d1/checkout')
      ? new Promise((resolve) => { resolveCheckout = resolve; })
      : Promise.resolve({ data: {} })));
    const { result, rerender } = await mount();
    rerender(baseProps({ activeDiagram: { ...diagram, id: 'd2' } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { resolveCheckout({ data: { status: 'success', lock: { user_id: 'u1' } } }); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.isLockedByOther).toBe(true);
    expect(result.current.hasLock).toBe(false);
    expect(axios.post.mock.calls.map(([url]) => url)).toContain('/api/diagrams/d1/checkin');
  });
});

describe('reconcileDraft', () => {
  const content = (x) => ({ nodes: [node('a', x)], edges: [] });
  const draftAt = (x, timestamp, extra = {}) => ({ ...content(x), timestamp, viewport: { x: 5, y: 5, zoom: 2 }, active_diagram_id: 'd1', base_updated_at: null, ...extra });
  const serverWith = (x, updated_at) => ({
    data: { id: 'd1', title: 'D', updated_at, diagram_data: JSON.stringify({ ...content(x), timestamp: '1999-01-01T00:00:00Z', viewport: { x: 0, y: 0, zoom: 1 }, active_diagram_id: 'd1' }) },
  });

  const run = async (draft, { authenticated = true, server } = {}) => {
    axios.get = vi.fn((url) => {
      if (url.endsWith('/lock-status')) return Promise.resolve({ data: { is_locked: true, lock: { user_id: 'u1' } } });
      return server ? server() : Promise.reject(new Error('unexpected GET'));
    });
    const { result, rerender } = await mount(baseProps({ isAuthenticated: authenticated }));
    let outcome;
    await act(async () => { outcome = await result.current.reconcileDraft(draft); });
    const diagramGets = axios.get.mock.calls.filter(([url]) => url === '/api/diagrams/d1');
    return { outcome, diagramGets, result, rerender };
  };

  const SERVER_AT = '2026-02-01T00:00:00Z';
  it.each([
    ['same content: server, not restored, even with a stale base', 0, 0, '2026-03-01T00:00:00Z', '2020-01-01T00:00:00Z', 'server', false, false],
    ['different content, base equals server version: draft restored', 0, 9, '2026-01-01T00:00:00Z', SERVER_AT, 'draft', true, false],
    ['base equal as an instant in another notation: draft restored', 0, 9, '2026-01-01T00:00:00Z', '2026-02-01T01:00:00+01:00', 'draft', true, false],
    ['different content, base stale: server with conflict', 0, 9, '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z', 'server', false, true],
    ['different content, base missing: server with conflict', 0, 9, '2026-01-01T00:00:00Z', null, 'server', false, true],
    ['newer draft timestamp does not beat a stale base', 0, 9, '2030-01-01T00:00:00Z', '2026-01-15T00:00:00Z', 'server', false, true],
  ])('%s', async (_name, serverX, draftX, draftTs, base, source, restored, conflict) => {
    const draft = draftAt(draftX, draftTs, { base_updated_at: base });
    const { outcome, diagramGets, result, rerender } = await run(draft, { server: () => Promise.resolve(serverWith(serverX, SERVER_AT)) });
    expect(diagramGets).toHaveLength(1);
    expect(outcome.source).toBe(source);
    expect(outcome.restored).toBe(restored);
    expect(Boolean(outcome.conflict)).toBe(conflict);
    if (conflict) expect(outcome.draft).toBe(draft);
    expect(outcome.data.nodes[0].position.x).toBe(source === 'server' ? serverX : draftX);
    expect(result.current.isRestoredFromDraft).toBe(restored);

    // the app now shows the chosen copy
    rerender(baseProps({ nodes: [node('a', outcome.data.nodes[0].position.x)] }));
    await settle();
    if (source === 'draft') {
      // a restored draft holds work the server lacks: uploaded once, as soon as it is shown
      expect(axios.put).toHaveBeenCalledTimes(1);
      const body = axios.put.mock.calls[0][1];
      expect(body.base_updated_at).toBe(base);
      expect(JSON.parse(body.diagram_data).nodes[0].position.x).toBe(draftX);
    } else if (serverX !== 0) {
      expect(axios.put).not.toHaveBeenCalled();
    }
  });

  it('loading the server copy does not trigger a save', async () => {
    const draft = draftAt(9, '2026-01-01T00:00:00Z', { base_updated_at: null });
    const { outcome, rerender } = await run(draft, { server: () => Promise.resolve(serverWith(7, SERVER_AT)) });
    expect(outcome.source).toBe('server');
    rerender(baseProps({ nodes: [node('a', 7)], edges: [] }));
    await settle();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('no diagram id: returns the draft without asking the server', async () => {
    const draft = draftAt(9, '2026-02-01T00:00:00Z', { active_diagram_id: null });
    const { outcome, diagramGets } = await run(draft);
    expect(outcome).toEqual({ source: 'draft', data: draft, restored: true });
    expect(diagramGets).toHaveLength(0);
  });

  it('not authenticated: returns the draft without asking the server', async () => {
    const draft = draftAt(9, '2026-02-01T00:00:00Z');
    const { outcome, diagramGets } = await run(draft, { authenticated: false });
    expect(outcome).toEqual({ source: 'draft', data: draft, restored: true });
    expect(diagramGets).toHaveLength(0);
  });

  it('server request fails: returns the draft', async () => {
    const draft = draftAt(9, '2026-02-01T00:00:00Z');
    const { outcome } = await run(draft, { server: () => Promise.reject(new Error('offline')) });
    expect(outcome).toEqual({ source: 'draft', data: draft, restored: true });
  });
});

describe('collaboration notices', () => {
  const emit = (detail) => act(() => { window.dispatchEvent(new CustomEvent('walflow_collab_event', { detail })); });

  it('shows a banner, not a blocking dialog, when a co-editor saved', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { result } = await mount();
    emit({ action: 'diagram_updated', diagram_id: 'd1', user_id: 'u2', username: 'alex', client_id: 'other-tab' });
    expect(result.current.collabNotice.kind).toBe('diagram_updated');
    expect(result.current.collabNotice.message).toContain('alex');
    expect(confirmSpy).not.toHaveBeenCalled();
    act(() => result.current.dismissCollabNotice());
    expect(result.current.collabNotice).toBeNull();
  });

  it('ignores the notice for the save this tab made itself', async () => {
    const { result, rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await settle();
    const ownClientId = axios.put.mock.calls[0][2].headers['X-Walflow-Client-Id'];
    emit({ action: 'diagram_updated', diagram_id: 'd1', user_id: 'u1', username: 'me', client_id: ownClientId });
    expect(result.current.collabNotice).toBeNull();
  });
});
