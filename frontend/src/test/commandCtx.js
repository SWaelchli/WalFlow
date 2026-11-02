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
    showReliefScenarios: false,
    telemetryMode: 'mitigated',
    actions,
    ...over,
  };
}

const PAGE_ACTIONS = [
  'newEntry', 'save', 'discard', 'edit', 'clone', 'remove', 'importTr2000', 'importLibrary', 'exportLibrary',
  'restoreDefaults', 'selectTab', 'toggleList', 'focusSearch', 'step',
];

/**
 * The state a Catalogue page reports (`ctx.pageState`), with a vi.fn per page action. Defaults: a manager with an
 * entry selected, not editing, three entries, the second selected.
 */
export function makePageState(over = {}) {
  // One vi.fn per page action, created up front so a test can list them all (Object.values) to assert none ran
  const actions = Object.fromEntries(PAGE_ACTIONS.map((name) => [name, vi.fn()]));
  return {
    tab: 'pipe_classes',
    entryLabel: 'pipe class',
    canManage: true,
    hasSelection: true,
    isEditing: false,
    isDirty: false,
    isSaving: false,
    listOpen: true,
    listLength: 3,
    selectedIndex: 1,
    editBlocked: null,
    deleteBlocked: null,
    actions,
    ...over,
  };
}
