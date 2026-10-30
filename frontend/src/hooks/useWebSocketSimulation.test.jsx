import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useWebSocketSimulation } from './useWebSocketSimulation';

vi.mock('./useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

let sockets;
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  constructor() { this.readyState = FakeSocket.OPEN; this.sent = []; sockets.push(this); }
  send(m) { this.sent.push(m); }
  close() { this.readyState = 3; }
}

const reply = (frame) => act(() => { sockets[0].onmessage({ data: JSON.stringify(frame) }); });
const props = (over = {}) => ({ nodes: [], edges: [], globalSettings: {}, cases: [], activeCaseId: 'case_base', ...over });

beforeEach(() => {
  sockets = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
