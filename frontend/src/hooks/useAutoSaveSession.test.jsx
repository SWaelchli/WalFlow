import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import axios from 'axios';
import { useAutoSaveSession } from './useAutoSaveSession';
import { getTabId } from '../utils/draftStorage';
import { notify } from '../utils/dialogs';

vi.mock('axios');
vi.mock('../utils/dialogs', async (importOriginal) => ({ ...(await importOriginal()), notify: vi.fn() }));
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
  notify.mockClear();
  axios.get = vi.fn().mockResolvedValue({ data: { is_locked: true, lock: { user_id: 'u1', username: 'me' } } });
  axios.put = vi.fn().mockResolvedValue({ data: { updated_at: '2026-01-01T00:00:05' } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });   // no vitest globals: unmount hooks here, or earlier tests keep listening on window

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

describe('switching drawings', () => {
  const d2 = { ...diagram, id: 'd2', title: 'Other' };
  const putUrls = () => axios.put.mock.calls.map(([url]) => url);

  it('saves a pending edit of the previous drawing instead of dropping it', async () => {
    const { result, rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));          // edit, cloud save still waiting
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    act(() => { result.current.markLoaded({ nodes: [node('b', 3)], edges: [], active_diagram_id: 'd2' }); });
    rerender(baseProps({ nodes: [node('a', 10)], activeDiagram: d2 }));   // other drawing opens, canvas not replaced yet
    rerender(baseProps({ nodes: [node('b', 3)], activeDiagram: d2 }));    // its content lands
    await settle();
    const toFirst = axios.put.mock.calls.filter(([url]) => url === '/api/diagrams/d1');
    expect(toFirst).toHaveLength(1);
    expect(toFirst[0][1].diagram_data).toContain('"x":10');
    expect(putUrls()).not.toContain('/api/diagrams/d2');
  });

  it('does not save a drawing that was only opened, even when loading normalises its edges', async () => {
    const { result, rerender } = await mount();
    // saved file has a pipe to a handle the node does not have; the canvas drops it on load
    const saved = {
      nodes: [node('a', 7), node('b', 9)],
      edges: [{ id: 'e1', source: 'a', target: 'b', targetHandle: 'inlet-0', data: {} }],
      active_diagram_id: 'd2',
    };
    act(() => { result.current.markLoaded(saved); });
    rerender(baseProps({ activeDiagram: d2 }));                             // drawing becomes active, canvas not replaced yet
    rerender(baseProps({ activeDiagram: d2, nodes: saved.nodes, edges: [] }));   // content lands without the dropped pipe
    await settle();
    expect(putUrls()).toEqual([]);

    rerender(baseProps({ activeDiagram: d2, nodes: [node('a', 20), node('b', 9)], edges: [] }));
    await settle();
    expect(putUrls()).toEqual(['/api/diagrams/d2']);
  });

  it('flushes a pending edit only after the save in flight resolved, based on the version it returned', async () => {
    let resolveFirst;
    axios.put = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ data: { updated_at: '2026-01-01T00:00:09' } });
    const { rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });      // save of x=10 is in flight
    rerender(baseProps({ nodes: [node('a', 20)] }));                           // newer edit waits for its timer
    rerender(baseProps({ nodes: [node('a', 20)], activeDiagram: d2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(axios.put).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst({ data: { updated_at: '2026-01-01T00:00:07' } }); await vi.advanceTimersByTimeAsync(0); });
    expect(axios.put).toHaveBeenCalledTimes(2);
    expect(axios.put.mock.calls[1][0]).toBe('/api/diagrams/d1');
    expect(axios.put.mock.calls[1][1].base_updated_at).toBe('2026-01-01T00:00:07');
    expect(axios.put.mock.calls[1][1].diagram_data).toContain('"x":20');
  });

  it('A -> B -> C after a save of A: the leave-save of B is based on B\'s own version, not A\'s', async () => {
    const dB = { ...d2, updated_at: '2026-02-02T00:00:00' };
    const dC = { ...diagram, id: 'd3', title: 'Third' };
    const { result, rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await settle();                                                           // save of A succeeded: its version is ...05
    act(() => { result.current.markLoaded({ nodes: [node('b', 3)], edges: [], active_diagram_id: 'd2' }); });
    rerender(baseProps({ nodes: [node('a', 10)], activeDiagram: dB }));
    rerender(baseProps({ nodes: [node('b', 3)], activeDiagram: dB }));
    rerender(baseProps({ nodes: [node('b', 30)], activeDiagram: dB }));      // edit of B, cloud save still waiting
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender(baseProps({ nodes: [node('b', 30)], activeDiagram: dC }));
    await settle();
    const toB = axios.put.mock.calls.filter(([url]) => url === '/api/diagrams/d2');
    expect(toB).toHaveLength(1);
    expect(toB[0][1].diagram_data).toContain('"x":30');
    expect(toB[0][1].base_updated_at).toBe('2026-02-02T00:00:00');
  });

  it('opening B waits for the leave-save of A before sending its checkout', async () => {
    let resolveLeaveSave;
    axios.get = vi.fn((url) => Promise.resolve(url.includes('/d2/')
      ? { data: { is_locked: false } }
      : { data: { is_locked: true, lock: { user_id: 'u1', username: 'me' } } }));
    axios.post = vi.fn().mockResolvedValue({ data: { status: 'success', lock: { user_id: 'u1', username: 'me' } } });
    axios.put = vi.fn(() => new Promise((resolve) => { resolveLeaveSave = resolve; }));
    const { rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender(baseProps({ nodes: [node('a', 10)], activeDiagram: d2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(axios.put).toHaveBeenCalledTimes(1);                               // leave-save of A is out, unanswered
    expect(axios.post.mock.calls.map(([url]) => url)).not.toContain('/api/diagrams/d2/checkout');
    await act(async () => { resolveLeaveSave({ data: { updated_at: '2026-01-01T00:00:07' } }); await vi.advanceTimersByTimeAsync(0); });
    const urls = axios.post.mock.calls.map(([url]) => url);
    expect(urls).toContain('/api/diagrams/d2/checkout');
    expect(axios.put.mock.invocationCallOrder[0]).toBeLessThan(axios.post.mock.invocationCallOrder[urls.indexOf('/api/diagrams/d2/checkout')]);
  });

  it('after Save As (same canvas, new drawing) an edit within 2 s is still uploaded', async () => {
    const { rerender } = await mount();
    rerender(baseProps({ activeDiagram: d2 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    rerender(baseProps({ activeDiagram: d2, nodes: [node('a', 10)] }));
    await settle();
    expect(putUrls()).toEqual(['/api/diagrams/d2']);
    expect(axios.put.mock.calls[0][1].diagram_data).toContain('"x":10');
  });
});

describe('saved time on open', () => {
  it('shows the opened drawing\'s own saved time, not the one that was left', async () => {
    const clock = (s) => new Date(s).toLocaleTimeString();
    const dA = { ...diagram, updated_at: '2026-01-01T08:15:00Z' };
    const dB = { ...diagram, id: 'd2', updated_at: '2026-02-02T17:45:30Z' };
    const { result, rerender } = await mount(baseProps({ activeDiagram: dA }));
    expect(result.current.lastSavedTimestamp).toBe(clock(dA.updated_at));
    rerender(baseProps({ activeDiagram: dB }));
    expect(result.current.lastSavedTimestamp).toBe(clock(dB.updated_at));
    expect(clock(dA.updated_at)).not.toBe(clock(dB.updated_at));
  });

  it.each([
    ['detached (no drawing): the left drawing\'s time is cleared', null, false],
    ['drawing without updated_at (restored draft): the previous time is kept', { id: 'd2', title: 'Draft', description: '' }, true],
  ])('%s', async (_name, next, kept) => {
    const dA = { ...diagram, updated_at: '2026-01-01T08:15:00Z' };
    const shown = new Date(dA.updated_at).toLocaleTimeString();
    const { result, rerender } = await mount(baseProps({ activeDiagram: dA }));
    expect(result.current.lastSavedTimestamp).toBe(shown);
    rerender(baseProps({ activeDiagram: next }));
    expect(result.current.lastSavedTimestamp).toBe(kept ? shown : null);
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

describe('autosave refused by the server (not a stale version)', () => {
  const refused = { response: { status: 409, headers: {}, data: {} } };
  const mine = { user_id: 'u1', username: 'me' };

  it.each([
    ['lock free: taken back with a resume checkout, save repeated', { data: { is_locked: false } }, true, 2, 'saved_cloud', true, 'me'],
    ['lock is this tab\'s: save repeated without a checkout', { data: { is_locked: true, lock: mine } }, false, 2, 'saved_cloud', true, 'me'],
    ['lock held by another user: the real lock is shown, nothing sent', { data: { is_locked: true, lock: { user_id: 'u2', username: 'alex' } } }, false, 1, 'locked', false, 'alex'],
  ])('%s', async (_name, lockStatus, expectCheckout, puts, status, hasLock, lockUser) => {
    axios.put = vi.fn()
      .mockRejectedValueOnce(refused)
      .mockResolvedValue({ data: { updated_at: '2026-01-01T00:00:05' } });
    axios.post = vi.fn().mockResolvedValue({ data: { status: 'success', lock: mine } });
    const { result, rerender } = await mount();
    axios.get = vi.fn().mockResolvedValue(lockStatus);                        // the server's answer once the save is refused
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await settle();
    const urls = axios.post.mock.calls.map(([url]) => url);
    expect(urls.includes('/api/diagrams/d1/checkout?resume=true')).toBe(expectCheckout);
    expect(urls).not.toContain('/api/diagrams/d1/checkout');
    expect(axios.put).toHaveBeenCalledTimes(puts);
    if (puts === 2) expect(axios.put.mock.calls[1][1].diagram_data).toContain('"x":10');
    expect(result.current.saveStatus).toBe(status);
    expect(result.current.hasLock).toBe(hasLock);
    expect(result.current.lockInfo?.username ?? null).toBe(lockUser);
    expect(result.current.lockInfo?.user_id).not.toBe('unknown');
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

describe('one lock per tab', () => {
  const emit = (detail) => act(() => { window.dispatchEvent(new CustomEvent('walflow_collab_event', { detail })); });
  const postUrls = () => axios.post.mock.calls.map(([url]) => url);
  const sessionHeader = (call) => call.slice(1).find((a) => a && a.headers)?.headers['X-Walflow-Session'];

  beforeEach(() => {
    axios.post = vi.fn().mockResolvedValue({ data: { status: 'success', lock: { user_id: 'u1', username: 'me' } } });
  });

  it('sends the pending save of the previous drawing before its checkin, both naming this tab', async () => {
    const { rerender } = await mount();
    rerender(baseProps({ nodes: [node('a', 10)] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender(baseProps({ nodes: [node('a', 10)], activeDiagram: { ...diagram, id: 'd2' } }));
    await settle();
    const putIdx = axios.put.mock.calls.findIndex(([url]) => url === '/api/diagrams/d1');
    const checkinIdx = axios.post.mock.calls.findIndex(([url]) => url === '/api/diagrams/d1/checkin');
    expect(putIdx).toBeGreaterThanOrEqual(0);
    expect(checkinIdx).toBeGreaterThanOrEqual(0);
    expect(axios.put.mock.invocationCallOrder[putIdx]).toBeLessThan(axios.post.mock.invocationCallOrder[checkinIdx]);
    expect(axios.put.mock.calls[putIdx][2].headers['X-Walflow-Session']).toBe(getTabId());
    expect(sessionHeader(axios.post.mock.calls[checkinIdx])).toBe(getTabId());
  });

  it('a lock of my user held by another tab is read-only here', async () => {
    axios.get = vi.fn().mockResolvedValue({ data: { is_locked: true, lock: { user_id: 'u1', username: 'me', session_id: 'some-other-tab' } } });
    const { result } = await mount();
    await settle();
    expect(result.current.hasLock).toBe(false);
    expect(postUrls()).not.toContain('/api/diagrams/d1/checkout');
  });

  it('a lock moved to another drawing from another tab ends editing here', async () => {
    const { result } = await mount();
    expect(result.current.hasLock).toBe(true);
    emit({ action: 'lock_released', diagram_id: 'd1', user_id: 'u1', reason: 'moved' });
    expect(result.current.hasLock).toBe(false);
  });

  it('quick switch A -> B -> A does not check A in', async () => {
    const { rerender } = await mount();
    rerender(baseProps({ activeDiagram: { ...diagram, id: 'd2' } }));
    rerender(baseProps());
    await settle();
    expect(postUrls()).not.toContain('/api/diagrams/d1/checkin');
  });

  it('the "Check out" button of the moved notice does nothing once another drawing is open', async () => {
    const { rerender } = await mount();
    emit({ action: 'lock_released', diagram_id: 'd1', user_id: 'u1', reason: 'moved' });
    const { action } = notify.mock.calls.find(([, , opts]) => opts && opts.action)[2];
    rerender(baseProps({ activeDiagram: { ...diagram, id: 'd2' } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    axios.post.mockClear();
    await act(async () => { action.onClick(); await vi.advanceTimersByTimeAsync(0); });
    expect(postUrls()).not.toContain('/api/diagrams/d1/checkout');
  });

  it.each([
    ['same user, other tab', { user_id: 'u1', session_id: 'some-other-tab' }, false],
    ['another user', { user_id: 'u2', username: 'alex' }, false],
    ['lock free', null, true],
    ['held by this tab', { user_id: 'u1', session_id: '__tab__' }, true],
  ])('after a reconnect: %s', async (_name, lock, expectCheckout) => {
    const { result } = await mount();
    expect(result.current.hasLock).toBe(true);
    const held = lock && { ...lock, session_id: lock.session_id === '__tab__' ? getTabId() : lock.session_id };
    axios.get = vi.fn().mockResolvedValue({ data: held ? { is_locked: true, lock: held } : { is_locked: false } });
    axios.post.mockClear();
    await act(async () => { result.current.reacquireAfterReconnect(); await vi.advanceTimersByTimeAsync(0); });
    expect(postUrls().includes('/api/diagrams/d1/checkout?resume=true')).toBe(expectCheckout);
    expect(postUrls()).not.toContain('/api/diagrams/d1/checkout');   // keeping a lock never releases the user's other locks
    expect(result.current.hasLock).toBe(expectCheckout);
  });

  it.each([
    ['heartbeat', async () => { await vi.advanceTimersByTimeAsync(61 * 1000); }],
    ['reconnect', async (result) => { result.current.reacquireAfterReconnect(); await vi.advanceTimersByTimeAsync(0); }],
  ])('%s refused because the lock moved to another drawing: lock cleared, moved notice, no plain retry', async (_name, trigger) => {
    const { result } = await mount();
    axios.post.mockClear();
    axios.get.mockClear();
    axios.post.mockRejectedValue({ response: { status: 409, headers: { 'x-lock-reason': 'moved' }, data: {} } });
    await act(async () => { await trigger(result); });
    expect(postUrls()).toEqual(['/api/diagrams/d1/checkout?resume=true']);
    expect(result.current.hasLock).toBe(false);
    expect(result.current.lockInfo).toBeNull();
    expect(notify.mock.calls.some(([, , opts]) => opts && opts.key === 'lock-moved:d1')).toBe(true);
    // a 'moved' answer is final: the lock status is not read again to look for another holder
    expect(axios.get.mock.calls.filter(([url]) => url.endsWith('/lock-status')).length).toBeLessThanOrEqual(1);
  });

  it.each([
    ['no activity: checked in after 30 minutes, no heartbeat afterwards', false],
    ['with activity: heartbeat keeps going and the lock is kept', true],
  ])('%s', async (_name, active) => {
    await mount();
    const checkouts = () => postUrls().filter((u) => u === '/api/diagrams/d1/checkout?resume=true').length;
    for (let i = 0; i < 7; i += 1) {                       // 35 minutes in 5-minute steps
      if (active) window.dispatchEvent(new Event('keydown'));
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    }
    if (active) {
      expect(postUrls()).not.toContain('/api/diagrams/d1/checkin');
      expect(checkouts()).toBeGreaterThanOrEqual(30);       // one per minute
    } else {
      expect(postUrls()).toContain('/api/diagrams/d1/checkin');
      const before = checkouts();
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
      expect(checkouts()).toBe(before);
      expect(before).toBeLessThanOrEqual(31);
    }
  });
});
