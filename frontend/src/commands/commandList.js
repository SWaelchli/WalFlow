/**
 * The command list: every user command, defined once. The keyboard shortcuts, the canvas context menus and the
 * Help shortcut list are built from it; the menu bar and command bar read it too (never wire a handler straight
 * into a button, menu item or key listener).
 *
 * Entry:
 *   id         'menu.name', unique
 *   label      sentence case, verb first, `…` when more input follows
 *   menu       one of MENU_ORDER
 *   group      items of one group sit together; a separator is drawn between groups
 *   icon       optional Phosphor icon component (IconLibrary)
 *   shortcut   optional { keys, altKeys?, display?, match(event) }; keys are shown in Help (Ctrl shows as ⌘ on Mac)
 *   help       optional longer text for the Help shortcut list
 *   contexts   canvas context menus the command appears in: 'node' | 'edge' | 'pane'
 *   contextLabel   { edge: 'Delete pipe' } label overrides per context
 *   danger     draws the item as destructive
 *   isVisible(ctx)  role only: false hides the command
 *   isEnabled(ctx)  true, or the reason (string) it cannot run now
 *   getLabel(ctx)   optional label that follows the state (`label` stays the static name for lists and Help)
 *   radio       the item is one of a group of radio items (shows a tick while checked())
 *   firesInInputs   the shortcut also works while a text field has focus (only Save); every other key is ignored there
 *   checked(ctx)    optional state of a toggle
 *   children(ctx)   optional submenu: [{ id, label, checked, run() }] (radio items); a child may instead be
 *                   { id, separator: true } (a rule) or carry toggle: true (a checkbox item, ticked when checked)
 *   expand(ctx)     optional context menu variants: [{ key, label, arg }], run(ctx, arg)
 *   showInContext(ctx, kind)  optional extra condition for a context menu
 *   run(ctx, arg)   calls the existing handler
 *
 * `ctx` is built by App.jsx on every render: `page` ('drawing' | 'catalogue'), selection, flags, state and `actions`
 * (the existing handlers), plus `pageState` (what the open page reports about itself).
 *
 * Each page has one definition (the drawing's is the list below; the others are in `pages/`): its name, menu order,
 * commands and key-only commands. The shared Tools and Help commands (`sharedCommands.js`) are appended to every
 * page. A new page adds one definition file and one entry in PAGES.
 */
import {
  PlusIcon, FolderOpenIcon, SaveIcon, ImportIcon, ExportIcon, CopyIcon, ClipboardIcon, TrashIcon, RotateIcon,
  PlayIcon, CaseIcon, FlameIcon, ReliefValveIcon, LockIcon, BookIcon, FolderIcon, GearIcon,
  DownloadIcon, PaletteIcon,
} from '../components/symbols/IconLibrary';
import { isMod, key, defineCommands } from './define';
import { SHARED_COMMANDS } from './sharedCommands';
import { CATALOGUE_PAGE } from './pages/catalogue';

export const MENU_ORDER = ['File', 'Edit', 'View', 'Simulation', 'Tools', 'Help'];

/** The reason shown for an edit on a drawing the user has not checked out. */
export const READ_ONLY_REASON = 'This drawing is read-only. Check it out to edit.';

const needsEdit = (ctx) => (ctx.isReadOnly ? READ_ONLY_REASON : true);
const selectedCount = (ctx) => ctx.selection.nodes.length + ctx.selection.edges.length;

const HEATMAP_MODES = [
  { id: 'default', label: 'Off' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'volumeflow', label: 'Flow' },
  { id: 'velocity', label: 'Velocity' },
];

const RELIEF_SCENARIOS = [
  { id: 'mitigated', label: 'Relieved system pressure' },
  { id: 'peak', label: 'Peak system pressure' },
  { id: 'unmitigated_global', label: 'Unmitigated peak pressure' },
];

const paneCommand = (id, label, icon, pane) => ({
  id, label, menu: 'View', group: 'panes', icon,
  isEnabled: () => true,
  checked: (ctx) => ctx.sidePaneOpen && ctx.sidePane === pane,
  // arg { open: true, tab } opens the pane (never collapses it), optionally on a tab
  run: (ctx, arg) => (arg?.open ? ctx.actions.openPane(pane, arg.tab) : ctx.actions.selectPane(pane)),
});

const DRAWING_COMMANDS = defineCommands([
  // File
  { id: 'file.new', label: 'New drawing…', menu: 'File', group: 'document', icon: PlusIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.newDrawing() },
  { id: 'file.open', label: 'Open…', menu: 'File', group: 'document', icon: FolderOpenIcon,
    isEnabled: (ctx) => (ctx.isAuthenticated ? true : 'Sign in to open cloud drawings'),
    run: (ctx) => ctx.actions.openDrawings() },
  { id: 'file.save', label: 'Save', menu: 'File', group: 'save', icon: SaveIcon,
    shortcut: { keys: ['Ctrl', 'S'], match: (e) => isMod(e) && key(e) === 's' },
    help: 'Manual save session draft or cloud project',
    firesInInputs: true,
    isEnabled: () => true, run: (ctx) => ctx.actions.save() },
  { id: 'file.save-as', label: 'Save as…', menu: 'File', group: 'save',
    isEnabled: () => true, run: (ctx) => ctx.actions.saveAs() },
  { id: 'file.import', label: 'Import .wlf file…', menu: 'File', group: 'files', icon: ImportIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.importFile() },
  { id: 'file.export', label: 'Export .wlf file', menu: 'File', group: 'files', icon: ExportIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.exportFile() },
  { id: 'file.export-csv', label: 'Export table as CSV', menu: 'File', group: 'files', icon: DownloadIcon,
    isEnabled: (ctx) => {
      const results = ctx.getResults();
      if (!results) return 'The results panel is not available';
      return results.canExportCsv ? true : 'Open the Pipes or Equipment tab in the results panel';
    },
    run: (ctx) => ctx.getResults()?.exportCsv() },

  // Edit
  { id: 'edit.undo', label: 'Undo', menu: 'Edit', group: 'history',
    shortcut: { keys: ['Ctrl', 'Z'], match: (e) => isMod(e) && !e.shiftKey && key(e) === 'z' },
    help: 'Undo previous canvas action',
    isEnabled: needsEdit, run: (ctx) => ctx.actions.undo() },
  { id: 'edit.redo', label: 'Redo', menu: 'Edit', group: 'history',
    shortcut: { keys: ['Ctrl', 'Y'], altKeys: ['Ctrl', 'Shift', 'Z'], match: (e) => (isMod(e) && key(e) === 'y') || (isMod(e) && e.shiftKey && key(e) === 'z') },
    help: 'Redo canvas action',
    isEnabled: needsEdit, run: (ctx) => ctx.actions.redo() },
  { id: 'edit.copy', label: 'Copy', menu: 'Edit', group: 'clipboard', icon: CopyIcon, contexts: ['node'],
    shortcut: { keys: ['Ctrl', 'C'], match: (e) => isMod(e) && key(e) === 'c' },
    help: 'Copy selected node(s) & connected edges',
    isEnabled: (ctx) => (selectedCount(ctx) > 0 ? true : 'Select a component or pipe first'),
    run: (ctx) => ctx.actions.copy() },
  { id: 'edit.paste', label: 'Paste', menu: 'Edit', group: 'clipboard', icon: ClipboardIcon, contexts: ['pane'],
    shortcut: { keys: ['Ctrl', 'V'], match: (e) => isMod(e) && key(e) === 'v' },
    help: 'Paste copied elements with spatial offset',
    isEnabled: (ctx) => (!ctx.hasClipboard() ? 'Copy something first' : needsEdit(ctx)),
    run: (ctx) => ctx.actions.paste() },
  { id: 'edit.duplicate', label: 'Duplicate', menu: 'Edit', group: 'clipboard', contexts: ['node'],
    shortcut: { keys: ['Ctrl', 'D'], match: (e) => isMod(e) && key(e) === 'd' },
    help: 'Duplicate selected elements instantly',
    isEnabled: (ctx) => (ctx.selection.nodes.length > 0 ? needsEdit(ctx) : 'Select a component first'),
    run: (ctx) => ctx.actions.duplicate() },
  { id: 'edit.delete', label: 'Delete', menu: 'Edit', group: 'clipboard', icon: TrashIcon, contexts: ['node', 'edge'],
    contextLabel: { edge: 'Delete pipe' }, danger: true,
    shortcut: { keys: ['Delete'], altKeys: ['Backspace'], display: 'Del', match: (e) => e.key === 'Delete' || e.key === 'Backspace' },
    help: 'Delete selected nodes or edges',
    isEnabled: (ctx) => (selectedCount(ctx) > 0 ? needsEdit(ctx) : 'Select a component or pipe first'),
    run: (ctx) => ctx.actions.deleteSelected() },
  { id: 'edit.select-all', label: 'Select all', menu: 'Edit', group: 'select', contexts: ['pane'],
    shortcut: { keys: ['Ctrl', 'A'], match: (e) => isMod(e) && key(e) === 'a' },
    help: 'Select all nodes on canvas',
    isEnabled: () => true, run: (ctx) => ctx.actions.selectAll() },
  { id: 'edit.rotate', label: 'Rotate', menu: 'Edit', group: 'select', icon: RotateIcon, contexts: ['node'],
    shortcut: { keys: ['R'], match: (e) => !isMod(e) && key(e) === 'r' },
    help: 'Rotate selected node 90° clockwise',
    isEnabled: (ctx) => (ctx.selection.nodes.length > 0 ? needsEdit(ctx) : 'Select a component first'),
    run: (ctx) => ctx.actions.rotate() },
  { id: 'edit.add-instrument', label: 'Add instrument', menu: 'Edit', group: 'insert', contexts: ['node'],
    // In a node menu: one item per sensing pin; elsewhere the first pin of the selected component
    expand: (ctx) => (ctx.instrumentTarget?.pins || []).map((pin) => ({
      key: pin,
      arg: pin,
      label: ctx.instrumentTarget.isTap ? 'Add instrument' : `Add instrument at ${ctx.pinLabel(pin)}`,
    })),
    isEnabled: (ctx) => ((ctx.instrumentTarget?.pins || []).length > 0 ? needsEdit(ctx) : 'Select a component with a sensing pin'),
    run: (ctx, pin) => {
      const target = ctx.instrumentTarget;
      if (target) ctx.actions.addInstrument(target.nodeId, pin ?? target.pins[0]);
    } },
  { id: 'edit.insert-tap', label: 'Insert measurement tap', menu: 'Edit', group: 'insert', contexts: ['edge'],
    showInContext: (ctx) => !!ctx.tapTarget?.canTap,
    isEnabled: (ctx) => {
      if (!ctx.tapTarget) return 'Select a pipe first';
      if (!ctx.tapTarget.canTap) return 'A tap cannot be inserted in this pipe';
      return needsEdit(ctx);
    },
    run: (ctx) => ctx.actions.insertTap(ctx.tapTarget.edgeId, ctx.tapTarget.getPoint()) },

  // View
  paneCommand('view.components', 'Components', PaletteIcon, 'components'),
  paneCommand('view.examples', 'Examples', BookIcon, 'examples'),
  paneCommand('view.drawings', 'Drawings', FolderIcon, 'drawings'),
  paneCommand('view.settings', 'Settings', GearIcon, 'settings'),
  { id: 'view.inspector', label: 'Inspector', menu: 'View', group: 'panels',
    isEnabled: (ctx) => (ctx.hasInspectorTarget ? true : 'Select a component or pipe'),
    checked: (ctx) => ctx.hasInspectorTarget && !ctx.inspectorCollapsed,
    run: (ctx) => ctx.actions.toggleInspector() },
  { id: 'view.results', label: 'Results panel', menu: 'View', group: 'panels',
    isEnabled: (ctx) => (ctx.getResults() ? true : 'The results panel is not available'),
    checked: (ctx) => !!ctx.getResults() && !ctx.getResults().collapsed,
    run: (ctx) => ctx.getResults()?.toggleCollapsed() },
  { id: 'view.zoom-in', label: 'Zoom in', menu: 'View', group: 'zoom',
    isEnabled: (ctx) => (ctx.hasCanvas ? true : 'The canvas is not ready'), run: (ctx) => ctx.actions.zoomIn() },
  { id: 'view.zoom-out', label: 'Zoom out', menu: 'View', group: 'zoom',
    isEnabled: (ctx) => (ctx.hasCanvas ? true : 'The canvas is not ready'), run: (ctx) => ctx.actions.zoomOut() },
  { id: 'view.fit', label: 'Fit view', menu: 'View', group: 'zoom', contexts: ['pane'],
    isEnabled: () => true, run: (ctx) => ctx.actions.fitView() },
  { id: 'view.lock', label: 'Lock canvas', menu: 'View', group: 'zoom', icon: LockIcon,
    isEnabled: () => true, checked: (ctx) => ctx.canvasLocked, run: (ctx) => ctx.actions.toggleLock() },
  { id: 'view.heatmap', label: 'Heatmap', menu: 'View', group: 'overlays', icon: FlameIcon,
    isEnabled: () => true,
    children: (ctx) => HEATMAP_MODES.map((m) => ({
      id: `view.heatmap.${m.id}`, label: m.label, checked: ctx.heatmapMode === m.id, run: () => ctx.actions.setHeatmapMode(m.id),
    })),
    run: (ctx) => ctx.actions.setHeatmapMode(ctx.heatmapMode === 'default' ? 'pressure' : 'default') },
  { id: 'view.relief-view', label: 'Relief scenario', menu: 'View', group: 'overlays', icon: ReliefValveIcon,
    isEnabled: () => true,
    children: (ctx) => [
      ...RELIEF_SCENARIOS.map((m) => ({
        id: `view.relief-view.${m.id}`, label: m.label, checked: ctx.telemetryMode === m.id, run: () => ctx.actions.setTelemetryMode(m.id),
      })),
      { id: 'view.relief-view.sep', separator: true },
      { id: 'view.relief-view.manager', label: 'Relief scenario manager', toggle: true, checked: !!ctx.showReliefScenarios,
        run: () => ctx.actions.toggleReliefScenarios() },
    ],
    run: () => {} },

  // Simulation
  { id: 'simulation.run', label: 'Run simulation', menu: 'Simulation', group: 'run', icon: PlayIcon,
    shortcut: { keys: ['Ctrl', 'Enter'], match: (e) => isMod(e) && e.key === 'Enter' },
    help: 'Run the simulation for the active case',
    isEnabled: (ctx) => (ctx.isSimulating ? 'A simulation is already running' : true),
    run: (ctx) => ctx.actions.run() },
  { id: 'simulation.solve-all', label: 'Solve all cases', menu: 'Simulation', group: 'run', icon: PlayIcon,
    isEnabled: (ctx) => {
      const results = ctx.getResults();
      if (!results) return 'The results panel is not available';
      return results.isBatchLoading ? 'Cases are being solved' : true;
    },
    run: (ctx) => ctx.getResults()?.solveAll() },
  { id: 'simulation.active-case', label: 'Active case', menu: 'Simulation', group: 'cases', icon: CaseIcon,
    isEnabled: () => true,
    children: (ctx) => ctx.cases.map((c) => ({
      id: `simulation.active-case.${c.id}`, label: `${c.name}${c.is_base ? ' (base)' : ''}`, checked: c.id === ctx.activeCaseId, run: () => ctx.actions.selectCase(c.id),
    })),
    run: () => {} },
  { id: 'simulation.new-case', label: 'New case…', menu: 'Simulation', group: 'cases', icon: PlusIcon,
    isEnabled: needsEdit, run: (ctx) => ctx.actions.addCase() },
]);

/** Commands with no top-level menu entry: canvas keys and commands reached from a submenu or canvas button. */
export const KEY_ONLY_COMMANDS = [
  // Also the Relief scenario submenu's manager item and the canvas button
  { id: 'view.relief-scenarios', label: 'Relief scenario manager', group: 'View', contexts: [],
    isEnabled: () => true, isVisible: () => true, checked: (ctx) => ctx.showReliefScenarios,
    run: (ctx) => ctx.actions.toggleReliefScenarios() },
  { id: 'canvas.deselect', label: 'Deselect all', group: 'Canvas', contexts: [],
    shortcut: { keys: ['Esc'], match: (e) => e.key === 'Escape' },
    help: 'Deselect all canvas items',
    isEnabled: () => true, isVisible: () => true, run: (ctx) => ctx.actions.deselectAll() },
];

const withShared = (page) => ({
  ...page,
  commands: [...page.commands, ...SHARED_COMMANDS.filter((c) => !page.hideShared?.includes(c.id))],
});

/** The drawing: the list above, then the shared Tools and Help commands. It has no page name (the menu bar shows the document). */
const DRAWING_PAGE = withShared({
  id: 'drawing', name: null, menuOrder: MENU_ORDER, commands: DRAWING_COMMANDS, keyOnlyCommands: KEY_ONLY_COMMANDS,
});

/** Every page by id: the one place a new page is registered. */
const PAGES = {
  drawing: DRAWING_PAGE,
  catalogue: withShared(CATALOGUE_PAGE),
};

export const COMMANDS = DRAWING_PAGE.commands;

/** The definition of a page `{ id, name, menuOrder, commands, keyOnlyCommands }`, shared commands included. Unknown ids give the drawing. */
export const getPageDefinition = (page = 'drawing') => PAGES[page] || DRAWING_PAGE;

const pageCommands = (page) => {
  const definition = getPageDefinition(page);
  return [...definition.commands, ...definition.keyOnlyCommands];
};

/** `{ File: [{ id, label }], ... }` in menu and list order for a page; for menus, tests and the docs sync test. */
export function listCommandsByMenu(page = 'drawing') {
  const definition = getPageDefinition(page);
  const byMenu = Object.fromEntries(definition.menuOrder.map((m) => [m, []]));
  definition.commands.forEach((c) => byMenu[c.menu].push({ id: c.id, label: c.label }));
  return byMenu;
}

export const getCommand = (id, page = 'drawing') => pageCommands(page).find((c) => c.id === id);

/** The label of a command in the current state (`New pipe class` rather than `New entry`). */
export const commandLabel = (command, ctx) => (command.getLabel ? command.getLabel(ctx) : command.label);

/** Runs a command of the open page by id if it is enabled; returns whether it ran. The menu bar and command bar go through this. */
export function runCommand(id, ctx, arg) {
  const command = getCommand(id, ctx.page);
  if (!command || (command.isVisible && !command.isVisible(ctx)) || command.isEnabled(ctx) !== true) return false;
  command.run(ctx, arg);
  return true;
}

/** The command a key press triggers on a page, or null. Commands are tried in list order. */
export function findCommandForKey(event, page = 'drawing') {
  return pageCommands(page).find((c) => c.shortcut?.match(event)) || null;
}

const isMacPlatform = () => typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

/** One key as this platform names it. */
export const formatKey = (k, isMac = isMacPlatform()) => (isMac ? ({ Ctrl: '⌘', Alt: '⌥' }[k] || k) : k);

/** Display text of a shortcut, as shown at the right of a menu item (`Ctrl+V`, `⌘V` on Mac, `Del`, `?`). */
export function formatShortcut(shortcut, isMac = isMacPlatform()) {
  if (!shortcut) return '';
  if (shortcut.display) return shortcut.display;
  const keys = shortcut.keys.map((k) => formatKey(k, isMac));
  return keys.join(isMac ? '' : '+');
}

/**
 * Rows of the Help shortcut list of a page: `[{ title, shortcuts: [{ keys, extraKeys?, label }] }]`, grouped by menu.
 * With `ctx`, a command hidden for this user is left out: its key does nothing for them.
 */
export function shortcutGroups(page = 'drawing', ctx = null) {
  const definition = getPageDefinition(page);
  const listed = (c) => c.shortcut && (!ctx || c.isVisible(ctx));
  const groups = [];
  const add = (title, command) => {
    let group = groups.find((g) => g.title === title);
    if (!group) { group = { title, shortcuts: [] }; groups.push(group); }
    group.shortcuts.push({
      keys: command.shortcut.keys,
      extraKeys: command.shortcut.altKeys,
      label: command.help || command.label,
    });
  };
  definition.commands.filter(listed).forEach((c) => add(c.menu, c));
  definition.keyOnlyCommands.filter(listed).forEach((c) => add(c.group, c));
  return groups;
}

/** Context menu items (for CanvasContextMenu) of `kind` ('node' | 'edge' | 'pane'), in list order with separators. */
export function buildContextMenuItems(kind, ctx) {
  const items = [];
  let lastGroup = null;
  COMMANDS.forEach((c) => {
    if (!c.contexts.includes(kind) || !c.isVisible(ctx)) return;
    if (c.showInContext && !c.showInContext(ctx, kind)) return;
    const variants = c.expand ? c.expand(ctx) : [{ key: c.id, label: c.contextLabel?.[kind] || c.label, arg: undefined }];
    if (variants.length === 0) return;
    const enabled = c.isEnabled(ctx);
    const groupKey = `${c.menu}/${c.group}`;
    if (lastGroup !== null && groupKey !== lastGroup) items.push({ separator: true });
    lastGroup = groupKey;
    variants.forEach((v) => {
      items.push({
        id: `${c.id}:${v.key}`,
        label: v.label,
        shortcut: formatShortcut(c.shortcut),
        disabled: enabled !== true,
        title: enabled === true ? undefined : enabled,
        danger: !!c.danger,
        onSelect: () => c.run(ctx, v.arg),
      });
    });
  });
  return items;
}
