/**
 * The Catalogue page: its menus, commands and keys. The page tells the menu bar its live state through
 * `ctx.pageState` (registered by CataloguePage and FittingStandardsTab with `usePageState`):
 *
 *   tab            'pipe_classes' | 'fitting_standards' | 'control_valves'
 *   entryLabel     'pipe class' | 'fitting standard' | 'control valve catalogue' (names the New command)
 *   canManage      the user may change the catalogue; write commands are hidden without it
 *   hasSelection   an entry is selected
 *   isEditing, isDirty, isSaving
 *   listOpen       the list pane is shown
 *   listLength, selectedIndex   position of the selection in the filtered list (-1 when it is not in it)
 *   editBlocked, deleteBlocked  the reason the selected entry cannot be edited or deleted, else null
 *   actions        stable callbacks: newEntry, save, discard, edit, clone, remove, importTr2000, importLibrary,
 *                  exportLibrary, restoreDefaults, selectTab, toggleList, focusSearch, step
 *
 * Entry fields: see commandList.js.
 */
import {
  PlusIcon, SaveIcon, GlobeIcon, ImportIcon, ExportIcon, ArrowLeftIcon, EditIcon, CopyIcon, TrashIcon, ResetIcon,
  SearchIcon, ArrowUpIcon, ArrowDownIcon,
} from '../../components/symbols/IconLibrary';
import { defineCommands, isMod, key } from '../define';

const NO_STATE = {
  tab: 'pipe_classes', entryLabel: 'entry', canManage: false, hasSelection: false, isEditing: false, isDirty: false,
  isSaving: false, listOpen: true, listLength: 0, selectedIndex: -1, editBlocked: null, deleteBlocked: null, actions: {},
};
const state = (ctx) => ctx.pageState || NO_STATE;
// Empty until the page has registered (its chunk may still load): a key pressed by then runs nothing
const actions = (ctx) => state(ctx).actions;
const canManage = (ctx) => state(ctx).canManage;

// A bare key: no Ctrl, Alt or Shift, so the browser's own combinations stay with the browser
const bare = (e) => !isMod(e) && !e.altKey && !e.shiftKey;

/** The selected entry can be acted on: true, or the reason it cannot (`blocked` is a permission reason, if any). */
const forSelected = (ctx, blocked) => {
  const s = state(ctx);
  if (!s.hasSelection) return 'Select an entry first';
  if (s.isEditing) return 'Finish editing first';
  return blocked || true;
};

const stepReason = (ctx, direction) => {
  const s = state(ctx);
  if (s.isEditing) return 'Finish editing first';
  if (s.listLength === 0) return 'The list is empty';
  if (direction < 0) {
    if (s.selectedIndex < 0) return 'Select an entry first';
    return s.selectedIndex === 0 ? 'This is the first entry' : true;
  }
  return s.selectedIndex >= s.listLength - 1 ? 'This is the last entry' : true;
};

const tabCommand = (id, tab, label, digit) => ({
  id, label, menu: 'View', group: 'tabs', radio: true,
  shortcut: {
    keys: ['Alt', String(digit)],
    // The physical key, so the shortcut works on every keyboard layout
    match: (e) => e.altKey && !isMod(e) && !e.shiftKey && (e.code === `Digit${digit}` || e.code === `Numpad${digit}`),
  },
  help: `Show ${label.toLowerCase()}`,
  isEnabled: () => true,
  checked: (ctx) => state(ctx).tab === tab,
  run: (ctx) => actions(ctx).selectTab?.(tab),
});

const COMMANDS = defineCommands([
  // File
  { id: 'catalogue.new', label: 'New entry…', menu: 'File', group: 'new', icon: PlusIcon,
    getLabel: (ctx) => `New ${state(ctx).entryLabel}…`,
    shortcut: { keys: ['N'], match: (e) => bare(e) && key(e) === 'n' },
    help: 'New pipe class, fitting standard or control valve catalogue, following the tab',
    isVisible: canManage, isEnabled: () => true, run: (ctx) => actions(ctx).newEntry() },
  { id: 'catalogue.save', label: 'Save changes', menu: 'File', group: 'save', icon: SaveIcon,
    shortcut: { keys: ['Ctrl', 'S'], match: (e) => isMod(e) && !e.altKey && key(e) === 's' },
    help: 'Save the entry being edited, also while typing in a field',
    firesInInputs: true,
    isVisible: canManage,
    isEnabled: (ctx) => {
      const s = state(ctx);
      if (!s.isEditing) return 'Nothing to save';
      return s.isSaving ? 'Saving in progress' : true;
    },
    run: (ctx) => actions(ctx).save() },
  { id: 'catalogue.import-tr2000', label: 'Import from TR2000…', menu: 'File', group: 'library', icon: GlobeIcon,
    isVisible: (ctx) => canManage(ctx) && state(ctx).tab === 'pipe_classes',
    isEnabled: () => true, run: (ctx) => actions(ctx).importTr2000() },
  { id: 'catalogue.import-library', label: 'Import library…', menu: 'File', group: 'library', icon: ImportIcon,
    // The import can change the entry being edited, and the file picker cannot wait for a discard question
    isVisible: canManage, isEnabled: (ctx) => (state(ctx).isEditing ? 'Finish editing first' : true),
    run: (ctx) => actions(ctx).importLibrary() },
  { id: 'catalogue.export-library', label: 'Export library', menu: 'File', group: 'library', icon: ExportIcon,
    isEnabled: () => true, run: (ctx) => actions(ctx).exportLibrary?.() },
  { id: 'catalogue.back', label: 'Back to drawing', menu: 'File', group: 'back', icon: ArrowLeftIcon,
    isEnabled: () => true, run: (ctx) => ctx.actions.toggleCatalogue() },

  // Edit (all write commands: the whole menu is hidden for a read-only user)
  { id: 'catalogue.edit', label: 'Edit selected', menu: 'Edit', group: 'entry', icon: EditIcon,
    shortcut: { keys: ['E'], match: (e) => bare(e) && key(e) === 'e' },
    help: 'Edit the selected entry',
    isVisible: canManage, isEnabled: (ctx) => forSelected(ctx, state(ctx).editBlocked), run: (ctx) => actions(ctx).edit() },
  { id: 'catalogue.clone', label: 'Clone selected', menu: 'Edit', group: 'entry', icon: CopyIcon,
    shortcut: { keys: ['Ctrl', 'D'], match: (e) => isMod(e) && !e.altKey && !e.shiftKey && key(e) === 'd' },
    help: 'Clone the selected entry',
    isVisible: canManage, isEnabled: (ctx) => forSelected(ctx), run: (ctx) => actions(ctx).clone() },
  { id: 'catalogue.delete', label: 'Delete selected', menu: 'Edit', group: 'entry', icon: TrashIcon, danger: true,
    // Delete only: Backspace stays with the text fields and the browser
    shortcut: { keys: ['Delete'], display: 'Del', match: (e) => bare(e) && e.key === 'Delete' },
    help: 'Delete the selected entry',
    isVisible: canManage, isEnabled: (ctx) => forSelected(ctx, state(ctx).deleteBlocked), run: (ctx) => actions(ctx).remove() },
  { id: 'catalogue.discard', label: 'Discard changes', menu: 'Edit', group: 'changes',
    shortcut: { keys: ['Esc'], match: (e) => bare(e) && e.key === 'Escape' },
    help: 'Stop editing and drop the changes (asks first when there are any)',
    isVisible: canManage, isEnabled: (ctx) => (state(ctx).isEditing ? true : 'Nothing to discard'),
    run: (ctx) => actions(ctx).discard() },
  { id: 'catalogue.restore', label: 'Restore defaults…', menu: 'Edit', group: 'changes', icon: ResetIcon,
    isVisible: canManage, isEnabled: (ctx) => (state(ctx).isEditing ? 'Finish editing first' : true),
    run: (ctx) => actions(ctx).restoreDefaults() },

  // View
  tabCommand('catalogue.tab-pipe-classes', 'pipe_classes', 'Pipe classes', 1),
  tabCommand('catalogue.tab-fitting-standards', 'fitting_standards', 'Fitting standards', 2),
  tabCommand('catalogue.tab-control-valves', 'control_valves', 'Control valve styles', 3),
  { id: 'catalogue.show-list', label: 'Show list', menu: 'View', group: 'list',
    isEnabled: () => true, checked: (ctx) => state(ctx).listOpen, run: (ctx) => actions(ctx).toggleList?.() },
  { id: 'catalogue.search', label: 'Search the list', menu: 'View', group: 'list', icon: SearchIcon,
    shortcut: { keys: ['/'], match: (e) => e.key === '/' && !isMod(e) && !e.altKey },
    help: 'Open the list and search it',
    isEnabled: () => true, run: (ctx) => actions(ctx).focusSearch?.() },
  { id: 'catalogue.previous', label: 'Previous entry', menu: 'View', group: 'step', icon: ArrowUpIcon,
    shortcut: { keys: ['Up'], match: (e) => bare(e) && e.key === 'ArrowUp' },
    help: 'Select the previous entry of the list',
    isEnabled: (ctx) => stepReason(ctx, -1), run: (ctx) => actions(ctx).step(-1) },
  { id: 'catalogue.next', label: 'Next entry', menu: 'View', group: 'step', icon: ArrowDownIcon,
    shortcut: { keys: ['Down'], match: (e) => bare(e) && e.key === 'ArrowDown' },
    help: 'Select the next entry of the list',
    isEnabled: (ctx) => stepReason(ctx, 1), run: (ctx) => actions(ctx).step(1) },
]);

export const CATALOGUE_PAGE = {
  id: 'catalogue',
  name: 'Catalogue',
  menuOrder: ['File', 'Edit', 'View', 'Tools', 'Help'],
  commands: COMMANDS,
  keyOnlyCommands: [],
  // Projects are a drawing matter
  hideShared: ['tools.projects'],
};
