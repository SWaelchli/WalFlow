import { vi } from 'vitest';

/** A command context for menu bar, command bar and command tests. `actions` creates one vi.fn per name on first use. */
export function makeCommandCtx(over = {}) {
  const fns = {};
  const actions = new Proxy({}, { get: (_t, name) => (fns[name] ||= vi.fn()) });
  return {
    isReadOnly: false,
    isSimulating: false,
    isAuthenticated: true,
    isAdmin: false,
    selection: { nodes: [], edges: [] },
    hasClipboard: () => false,
    getResults: () => null,
    cases: [{ id: 'c1', name: 'Base', is_base: true }, { id: 'c2', name: 'Winter' }],
    activeCaseId: 'c1',
    sidePane: 'components',
    sidePaneOpen: true,
    hasInspectorTarget: false,
    inspectorCollapsed: false,
    hasCanvas: true,
    canvasLocked: false,
    heatmapMode: 'default',
    showCaseManager: false,
    actions,
    ...over,
  };
}
