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

describe('cloud autosave (F2-11, F2-25)', () => {
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

describe('collaboration notices (F2-11)', () => {
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
