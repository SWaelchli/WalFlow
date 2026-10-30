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
 *   checked(ctx)    optional state of a toggle
 *   children(ctx)   optional submenu: [{ id, label, checked, run() }]
 *   expand(ctx)     optional context menu variants: [{ key, label, arg }], run(ctx, arg)
 *   showInContext(ctx, kind)  optional extra condition for a context menu
 *   run(ctx, arg)   calls the existing handler
 *
 * `ctx` is built by App.jsx on every render: selection, flags, state and `actions` (the existing handlers).
 */
import {
  PlusIcon, FolderOpenIcon, SaveIcon, ImportIcon, ExportIcon, CopyIcon, ClipboardIcon, TrashIcon, RotateIcon,
  PlayIcon, CaseIcon, FlameIcon, LockIcon, HelpIcon, KeyboardIcon, InfoIcon, BookIcon, FolderIcon, GearIcon,
  CrownIcon, DownloadIcon, PaletteIcon,
} from '../components/symbols/IconLibrary';

export const MENU_ORDER = ['File', 'Edit', 'View', 'Simulation', 'Tools', 'Help'];

/** The reason shown for an edit on a drawing the user has not checked out. */
export const READ_ONLY_REASON = 'This drawing is read-only. Check it out to edit.';

const isMod = (e) => e.ctrlKey || e.metaKey;
const key = (e) => e.key.toLowerCase();

const needsEdit = (ctx) => (ctx.isReadOnly ? READ_ONLY_REASON : true);
const selectedCount = (ctx) => ctx.selection.nodes.length + ctx.selection.edges.length;

const HEATMAP_MODES = [
  { id: 'default', label: 'Off' },
  { id: 'pressure', label: 'Pressure' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'volumeflow', label: 'Flow' },
  { id: 'velocity', label: 'Velocity' },
];

const paneCommand = (id, label, icon, pane) => ({
  id, label, menu: 'View', group: 'panes', icon,
  isEnabled: () => true,
  checked: (ctx) => ctx.sidePaneOpen && ctx.sidePane === pane,
  // arg { open: true, tab } opens the pane (never collapses it), optionally on a tab
  run: (ctx, arg) => (arg?.open ? ctx.actions.openPane(pane, arg.tab) : ctx.actions.selectPane(pane)),
});

export const COMMANDS = [
  // File
  { id: 'file.new', label: 'New drawing…', menu: 'File', group: 'document', icon: PlusIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.newDrawing() },
  { id: 'file.open', label: 'Open…', menu: 'File', group: 'document', icon: FolderOpenIcon,
    isEnabled: (ctx) => (ctx.isAuthenticated ? true : 'Sign in to open cloud drawings'),
    run: (ctx) => ctx.actions.openDrawings() },
  { id: 'file.save', label: 'Save', menu: 'File', group: 'save', icon: SaveIcon,
    shortcut: { keys: ['Ctrl', 'S'], match: (e) => isMod(e) && key(e) === 's' },
    help: 'Manual save session draft or cloud project',
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
      return results.canExportCsv ? true : 'Open the Pipe Network List or Full Equipment tab in the results panel';
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
  { id: 'view.case-manager', label: 'Case manager', menu: 'View', group: 'overlays', icon: CaseIcon,
    isEnabled: () => true, checked: (ctx) => ctx.showCaseManager, run: (ctx) => ctx.actions.toggleCaseManager() },

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

  // Tools
  { id: 'tools.catalogue', label: 'Catalogue', menu: 'Tools', group: 'pages', icon: BookIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openCatalogue() },
  { id: 'tools.projects', label: 'Manage projects…', menu: 'Tools', group: 'pages', icon: FolderIcon,
    isEnabled: (ctx) => (ctx.isAuthenticated ? true : 'Sign in to manage projects'),
    run: (ctx) => ctx.actions.openProjects() },
  { id: 'tools.admin', label: 'Admin hub…', menu: 'Tools', group: 'pages', icon: CrownIcon,
    isVisible: (ctx) => !!ctx.isAdmin,
    isEnabled: () => true, run: (ctx) => ctx.actions.openAdminHub() },

  // Help
  { id: 'help.guide', label: 'User guide', menu: 'Help', group: 'help', icon: BookIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('guide') },
  { id: 'help.shortcuts', label: 'Keyboard shortcuts', menu: 'Help', group: 'help', icon: KeyboardIcon,
    shortcut: { keys: ['Shift', '?'], display: '?', match: (e) => e.key === '?' && !isMod(e) },
    help: 'Open this Help screen (Esc closes it)',
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('shortcuts') },
  { id: 'help.model', label: 'Model & limits', menu: 'Help', group: 'help', icon: HelpIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('model') },
  { id: 'help.about', label: 'About WalFlow', menu: 'Help', group: 'about', icon: InfoIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.openHelp('about') },
].map((c) => ({ isVisible: () => true, contexts: [], ...c }));

/** Keys that act on the canvas but are not menu commands. Listed in Help; not part of any menu. */
export const KEY_ONLY_COMMANDS = [
  { id: 'canvas.deselect', label: 'Deselect all', group: 'Canvas', contexts: [],
    shortcut: { keys: ['Esc'], match: (e) => e.key === 'Escape' },
    help: 'Deselect all canvas items',
    isEnabled: () => true, isVisible: () => true, run: (ctx) => ctx.actions.deselectAll() },
];

/** `{ File: [{ id, label }], ... }` in menu and list order; for menus, tests and the docs sync test. */
export function listCommandsByMenu() {
  const byMenu = Object.fromEntries(MENU_ORDER.map((m) => [m, []]));
  COMMANDS.forEach((c) => byMenu[c.menu].push({ id: c.id, label: c.label }));
  return byMenu;
}

export const getCommand = (id) => COMMANDS.find((c) => c.id === id) || KEY_ONLY_COMMANDS.find((c) => c.id === id);

/** Runs a command by id if it is enabled; returns whether it ran. The menu bar and command bar go through this. */
export function runCommand(id, ctx, arg) {
  const command = getCommand(id);
  if (!command || command.isEnabled(ctx) !== true) return false;
  command.run(ctx, arg);
  return true;
}

/** The command a key press triggers, or null. Commands are tried in list order. */
export function findCommandForKey(event) {
  return [...COMMANDS, ...KEY_ONLY_COMMANDS].find((c) => c.shortcut?.match(event)) || null;
}

const isMacPlatform = () => typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

/** Display text of a shortcut, as shown at the right of a menu item (`Ctrl+V`, `⌘V` on Mac, `Del`, `?`). */
export function formatShortcut(shortcut, isMac = isMacPlatform()) {
  if (!shortcut) return '';
  if (shortcut.display) return shortcut.display;
  const keys = shortcut.keys.map((k) => (k === 'Ctrl' && isMac ? '⌘' : k));
  return keys.join(isMac ? '' : '+');
}

/** Rows of the Help shortcut list: `[{ title, shortcuts: [{ keys, extraKeys?, label }] }]`, grouped by menu. */
export function shortcutGroups() {
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
  COMMANDS.filter((c) => c.shortcut).forEach((c) => add(c.menu, c));
  KEY_ONLY_COMMANDS.forEach((c) => add(c.group, c));
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
