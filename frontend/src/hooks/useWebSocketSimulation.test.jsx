import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useWebSocketSimulation } from './useWebSocketSimulation';

const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ isAuthenticated: auth.isAuthenticated }) }));

let sockets;
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static initialState = FakeSocket.OPEN;
  constructor() { this.readyState = FakeSocket.initialState; this.sent = []; this.closeCalls = []; sockets.push(this); }
  send(m) { this.sent.push(m); }
  close() { this.closeCalls.push(this.readyState); this.readyState = 3; }
}

const reply = (frame) => act(() => { sockets[0].onmessage({ data: JSON.stringify(frame) }); });
const props = (over = {}) => ({ nodes: [], edges: [], globalSettings: {}, cases: [], activeCaseId: 'case_base', ...over });

beforeEach(() => {
  sockets = [];
  auth.isAuthenticated = true;
  FakeSocket.initialState = FakeSocket.OPEN;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('closing the connection on cleanup', () => {
  it('closes an open socket straight away', () => {
    const { unmount } = renderHook(() => useWebSocketSimulation(props()));
    unmount();
    expect(sockets[0].closeCalls).toEqual([FakeSocket.OPEN]);
  });

  it('detaches an open socket on unmount so a late message or close cannot change state', () => {
    const { result, unmount } = renderHook(() => useWebSocketSimulation(props()));
    const socket = sockets[0];
    act(() => { socket.onopen(); });
    act(() => { result.current.runSimulation(); });
    expect(result.current).toMatchObject({ isConnected: true, isSimulating: true });
    unmount();
    expect([socket.onmessage, socket.onerror, socket.onclose]).toEqual([null, null, null]);
    expect(socket.closeCalls).toEqual([FakeSocket.OPEN]);
  });

  it('flips isConnected false then true when the effect re-runs, so the graph is re-sent on the new socket', () => {
    const { result, rerender } = renderHook(() => useWebSocketSimulation(props()));
    const old = sockets[0];
    act(() => { old.onopen(); });
    act(() => { result.current.runSimulation(); });
    expect(result.current).toMatchObject({ isConnected: true, isSimulating: true });

    auth.isAuthenticated = false;
    rerender();
    expect(sockets).toHaveLength(2);
    expect(old.closeCalls).toEqual([FakeSocket.OPEN]);
    expect(old.onclose).toBeNull();
    expect(result.current).toMatchObject({ isConnected: false, isSimulating: false });

    act(() => { sockets[1].onopen(); });
    expect(result.current.isConnected).toBe(true);
  });

  it('never closes a socket that is still connecting; it is closed once it opens and late events are ignored', () => {
    vi.useFakeTimers();
    try {
      FakeSocket.initialState = FakeSocket.CONNECTING;
      const { result, unmount } = renderHook(() => useWebSocketSimulation(props()));
      unmount();
      const socket = sockets[0];
      expect(socket.closeCalls).toEqual([]);

      // Late events from the abandoned socket change nothing and schedule no reconnect
      socket.onmessage?.({ data: JSON.stringify({ status: 'error', message: 'late' }) });
      socket.onerror?.(new Event('error'));
      socket.onclose?.({ code: 1006 });
      vi.advanceTimersByTime(10000);
      expect(sockets).toHaveLength(1);
      expect(result.current.runError).toBeNull();
      expect(console.warn).not.toHaveBeenCalled();

      socket.readyState = FakeSocket.OPEN;
      socket.onopen?.();
      expect(socket.closeCalls).toEqual([FakeSocket.OPEN]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('solver error frames', () => {
  const target = { type: 'Connection', id: 'e7', name: 'Pipe 7' };

  it('keeps target and detail with the message, clears the pending case readouts, and drops all on success', () => {
    const onClear = vi.fn();
    const { result } = renderHook(() => useWebSocketSimulation(props({ activeCaseId: 'case_2', onClearCaseTelemetry: onClear })));
    act(() => { result.current.runSimulation(); });
    reply({ status: 'success', stats: { iterations: 3 }, telemetry: {} });
    expect(result.current.lastStats).not.toBeNull();
    expect(result.current.lastRunAt).not.toBeNull();
    act(() => { result.current.runSimulation(); });
    reply({ status: 'error', message: 'Check Pipe 7.', kind: 'solve', target, detail: 'fsolve failed' });
    expect(result.current).toMatchObject({ runError: 'Check Pipe 7.', runErrorTarget: target, runErrorDetail: 'fsolve failed', lastStats: null, lastRunAt: null });
    expect(onClear).toHaveBeenCalledExactlyOnceWith('case_2');

    act(() => { result.current.runSimulation(); });
    expect(result.current.runErrorTarget).toBeNull();
    reply({ status: 'success', stats: {}, telemetry: {} });
    expect(result.current).toMatchObject({ runError: null, runErrorTarget: null, runErrorDetail: null });
  });

  it('accepts a frame with only a message and leaves the cases alone when no run was pending', () => {
    const onClear = vi.fn();
    const { result } = renderHook(() => useWebSocketSimulation(props({ onClearCaseTelemetry: onClear })));
    reply({ status: 'error', message: 'Plain failure' });
    expect(result.current).toMatchObject({ runError: 'Plain failure', runErrorTarget: null, runErrorDetail: null });
    expect(onClear).not.toHaveBeenCalled();
  });
});
