import { describe, it, expect } from 'vitest';
import {
  runCommand, getCommand, listCommandsByMenu, shortcutGroups, getPageDefinition, commandLabel, findCommandForKey,
  COMMANDS, KEY_ONLY_COMMANDS,
} from './commandList';
import { makeCommandCtx, makePageState } from '../test/commandCtx';

describe('pane commands', () => {
  it('toggle through selectPane without an argument', () => {
    const ctx = makeCommandCtx();
    runCommand('view.examples', ctx);
    expect(ctx.actions.selectPane).toHaveBeenCalledWith('examples');
    expect(ctx.actions.openPane).not.toHaveBeenCalled();
  });

  it.each([
    ['already open pane', { sidePane: 'settings', sidePaneOpen: true }],
    ['collapsed pane', { sidePane: 'components', sidePaneOpen: false }],
  ])('{ open: true } opens through openPane and never toggles: %s', (_n, over) => {
    const ctx = makeCommandCtx(over);
    runCommand('view.settings', ctx, { open: true, tab: 'global' });
    expect(ctx.actions.openPane).toHaveBeenCalledWith('settings', 'global');
    expect(ctx.actions.selectPane).not.toHaveBeenCalled();
  });
});

describe('relief scenario commands', () => {
  it('the manager command stays runnable by id for the canvas button but has no top-level menu entry', () => {
    expect(getCommand('view.case-manager')).toBeUndefined();
    const command = getCommand('view.relief-scenarios');
    expect(command.label).toBe('Relief scenario manager');
    expect(command.menu).toBeUndefined();
    expect(command.shortcut).toBeUndefined();
    expect(Object.values(listCommandsByMenu()).flat().map((c) => c.id)).not.toContain('view.relief-scenarios');
    expect(command.checked(makeCommandCtx({ showReliefScenarios: true }))).toBe(true);
    const ctx = makeCommandCtx();
    runCommand('view.relief-scenarios', ctx);
    expect(ctx.actions.toggleReliefScenarios).toHaveBeenCalledTimes(1);
  });

  it('the scenario submenu is a radio group on telemetryMode and sets the mode', () => {
    const ctx = makeCommandCtx({ telemetryMode: 'peak' });
    const menu = getCommand('view.relief-view');
    expect(menu.label).toBe('Relief scenario');
    const children = menu.children(ctx);
    expect(children.map((c) => c.id)).toEqual([
      'view.relief-view.mitigated', 'view.relief-view.peak', 'view.relief-view.unmitigated_global',
      'view.relief-view.sep', 'view.relief-view.manager',
    ]);
    expect(children.slice(0, 3).map((c) => c.checked)).toEqual([false, true, false]);
    children[2].run();
    expect(ctx.actions.setTelemetryMode).toHaveBeenCalledWith('unmitigated_global');
    expect(children[3].separator).toBe(true);
  });

  it('the submenu ends with the manager toggle, checked by showReliefScenarios', () => {
    const menu = getCommand('view.relief-view');
    const off = makeCommandCtx({ showReliefScenarios: false });
    const manager = menu.children(off).at(-1);
    expect(manager).toMatchObject({ label: 'Relief scenario manager', toggle: true, checked: false });
    expect(menu.children(makeCommandCtx({ showReliefScenarios: true })).at(-1).checked).toBe(true);
    manager.run();
    expect(off.actions.toggleReliefScenarios).toHaveBeenCalledTimes(1);
  });
});

describe('Export table as CSV', () => {
  it.each([
    ['no results panel', null, 'The results panel is not available'],
    ['a tab without a list', { canExportCsv: false }, 'Open the Pipes or Equipment tab in the results panel'],
    ['the Pipes or Equipment tab', { canExportCsv: true }, true],
  ])('is enabled only with a list tab open: %s', (_n, results, expected) => {
    expect(getCommand('file.export-csv').isEnabled(makeCommandCtx({ getResults: () => results }))).toBe(expected);
  });
});

const catalogueCtx = (stateOver = {}, ctxOver = {}) => makeCommandCtx({ page: 'catalogue', pageState: makePageState(stateOver), ...ctxOver });
const visibleLabels = (menu, ctx) => getPageDefinition('catalogue').commands
  .filter((c) => c.menu === menu && c.isVisible(ctx)).map((c) => commandLabel(c, ctx));

describe('Catalogue page menus', () => {
  it('has File, Edit, View, Tools and Help and no Simulation menu', () => {
    expect(Object.keys(listCommandsByMenu('catalogue'))).toEqual(['File', 'Edit', 'View', 'Tools', 'Help']);
  });

  it('holds no drawing command, and each page finds only its own commands by id', () => {
    const page = new Set(getPageDefinition('catalogue').commands.map((c) => c.id));
    COMMANDS.filter((c) => c.menu !== 'Tools' && c.menu !== 'Help').forEach((c) => expect(page.has(c.id), c.id).toBe(false));
    expect(Object.keys(listCommandsByMenu())).toContain('Simulation');
    expect(getCommand('file.save', 'catalogue')).toBeUndefined();
    expect(getCommand('catalogue.save', 'catalogue')).toBeDefined();
    expect(getCommand('catalogue.save')).toBeUndefined();
  });

  it('Tools lists Catalogue ticked, Admin hub for admins only, and never Manage projects', () => {
    expect(visibleLabels('Tools', catalogueCtx({}, { isAdmin: false }))).toEqual(['Catalogue']);
    expect(visibleLabels('Tools', catalogueCtx({}, { isAdmin: true }))).toEqual(['Catalogue', 'Admin hub…']);
    expect(getCommand('tools.catalogue', 'catalogue').checked(catalogueCtx())).toBe(true);
  });

  it('a manager sees every command in the documented order', () => {
    const ctx = catalogueCtx();
    expect(visibleLabels('File', ctx)).toEqual([
      'New pipe class…', 'Save changes', 'Import from TR2000…', 'Import library…', 'Export library', 'Back to drawing',
    ]);
    expect(visibleLabels('Edit', ctx)).toEqual([
      'Edit selected', 'Clone selected', 'Delete selected', 'Discard changes', 'Restore defaults…',
    ]);
    expect(visibleLabels('View', ctx)).toEqual([
      'Pipe classes', 'Fitting standards', 'Control valve styles', 'Show list', 'Search the list', 'Previous entry', 'Next entry',
    ]);
  });

  it.each([
    ['pipe_classes', 'pipe class', 'New pipe class…', true],
    ['fitting_standards', 'fitting standard', 'New fitting standard…', false],
    ['control_valves', 'control valve catalogue', 'New control valve catalogue…', false],
  ])('the New label and the TR2000 import follow the tab: %s', (tab, entryLabel, label, tr2000) => {
    const ctx = catalogueCtx({ tab, entryLabel });
    expect(commandLabel(getCommand('catalogue.new', 'catalogue'), ctx)).toBe(label);
    expect(getCommand('catalogue.import-tr2000', 'catalogue').isVisible(ctx)).toBe(tr2000);
  });

  it('a read-only user loses every write command and the whole Edit menu, but keeps Export library', () => {
    const ctx = catalogueCtx({ canManage: false });
    expect(visibleLabels('File', ctx)).toEqual(['Export library', 'Back to drawing']);
    expect(visibleLabels('Edit', ctx)).toEqual([]);
    expect(visibleLabels('View', ctx)).toHaveLength(7);
  });

  it('without any page state (a tab still loading) no command throws or runs', () => {
    const ctx = makeCommandCtx({ page: 'catalogue', pageState: null });
    getPageDefinition('catalogue').commands.forEach((c) => expect(() => c.isEnabled(ctx), c.id).not.toThrow());
    expect(runCommand('catalogue.save', ctx)).toBe(false);
    // Always-enabled commands run on a key pressed before the page chunk registered: they do nothing
    ['catalogue.tab-pipe-classes', 'catalogue.tab-fitting-standards', 'catalogue.tab-control-valves',
      'catalogue.show-list', 'catalogue.search', 'catalogue.export-library']
      .forEach((id) => expect(() => runCommand(id, ctx), id).not.toThrow());
  });

  it.each([
    ['catalogue.edit', { hasSelection: false }, 'Select an entry first'],
    ['catalogue.clone', { hasSelection: false }, 'Select an entry first'],
    ['catalogue.delete', { hasSelection: false }, 'Select an entry first'],
    ['catalogue.edit', { isEditing: true }, 'Finish editing first'],
    ['catalogue.clone', { isEditing: true }, 'Finish editing first'],
    ['catalogue.delete', { isEditing: true }, 'Finish editing first'],
    ['catalogue.restore', { isEditing: true }, 'Finish editing first'],
    ['catalogue.edit', { editBlocked: 'Only an admin can edit built-in standards' }, 'Only an admin can edit built-in standards'],
    ['catalogue.delete', { deleteBlocked: 'Built-in standards cannot be deleted' }, 'Built-in standards cannot be deleted'],
    ['catalogue.clone', { editBlocked: 'x', deleteBlocked: 'y' }, true],
    ['catalogue.save', { isEditing: false }, 'Nothing to save'],
    ['catalogue.save', { isEditing: true, isSaving: true }, 'Saving in progress'],
    ['catalogue.save', { isEditing: true }, true],
    ['catalogue.discard', { isEditing: false }, 'Nothing to discard'],
    ['catalogue.discard', { isEditing: true }, true],
    ['catalogue.restore', {}, true],
    ['catalogue.import-library', { isEditing: true }, 'Finish editing first'],
    ['catalogue.import-library', {}, true],
    ['catalogue.previous', { selectedIndex: 0 }, 'This is the first entry'],
    ['catalogue.next', { selectedIndex: 2 }, 'This is the last entry'],
    ['catalogue.previous', { selectedIndex: -1 }, 'Select an entry first'],
    ['catalogue.next', { listLength: 0, selectedIndex: -1 }, 'The list is empty'],
    ['catalogue.next', { isEditing: true }, 'Finish editing first'],
    ['catalogue.next', {}, true],
  ])('%s with %j is enabled as %j', (id, stateOver, expected) => {
    expect(getCommand(id, 'catalogue').isEnabled(catalogueCtx(stateOver))).toBe(expected);
  });

  it('a disabled command does not run; an enabled one calls the page action once', () => {
    const blocked = catalogueCtx({ hasSelection: false });
    expect(runCommand('catalogue.clone', blocked)).toBe(false);
    expect(blocked.pageState.actions.clone).not.toHaveBeenCalled();

    const ok = catalogueCtx({ isEditing: true });
    expect(runCommand('catalogue.save', ok)).toBe(true);
    expect(ok.pageState.actions.save).toHaveBeenCalledTimes(1);
  });

  it('a command hidden for the role never runs, by key lookup or by id', () => {
    const ctx = catalogueCtx({ canManage: false, isEditing: true });
    ['catalogue.new', 'catalogue.save', 'catalogue.edit', 'catalogue.clone', 'catalogue.delete', 'catalogue.discard', 'catalogue.restore', 'catalogue.import-library']
      .forEach((id) => {
        expect(runCommand(id, ctx), id).toBe(false);
        expect(getCommand(id, 'catalogue').isVisible(ctx), id).toBe(false);
      });
    Object.values(ctx.pageState.actions).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(runCommand('catalogue.export-library', ctx)).toBe(true);
    expect(ctx.pageState.actions.exportLibrary).toHaveBeenCalledTimes(1);
  });

  it('the three tabs are radios that tick the active tab and select a tab through the page', () => {
    const ctx = catalogueCtx({ tab: 'fitting_standards' });
    const tabs = ['catalogue.tab-pipe-classes', 'catalogue.tab-fitting-standards', 'catalogue.tab-control-valves'].map((id) => getCommand(id, 'catalogue'));
    tabs.forEach((c) => expect(c.radio).toBe(true));
    expect(tabs.map((c) => c.checked(ctx))).toEqual([false, true, false]);
    runCommand('catalogue.tab-control-valves', ctx);
    expect(ctx.pageState.actions.selectTab).toHaveBeenCalledWith('control_valves');
  });

  it('Show list is ticked only while the list is open', () => {
    expect(getCommand('catalogue.show-list', 'catalogue').checked(catalogueCtx({ listOpen: false }))).toBe(false);
    expect(getCommand('catalogue.show-list', 'catalogue').checked(catalogueCtx({ listOpen: true }))).toBe(true);
  });

  it('Back to drawing runs the Tools > Catalogue toggle of the app', () => {
    const ctx = catalogueCtx();
    runCommand('catalogue.back', ctx);
    expect(ctx.actions.toggleCatalogue).toHaveBeenCalledTimes(1);
  });
});

describe('commandLabel', () => {
  it('uses getLabel when the command has one and the static label otherwise', () => {
    const ctx = catalogueCtx({ entryLabel: 'fitting standard' });
    expect(commandLabel(getCommand('catalogue.new', 'catalogue'), ctx)).toBe('New fitting standard…');
    expect(commandLabel(getCommand('file.save'), makeCommandCtx())).toBe('Save');
  });
});

describe('key lookup per page', () => {
  const press = (init) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init });

  it.each([
    ['n', { key: 'n' }, 'catalogue.new'],
    ['e', { key: 'e' }, 'catalogue.edit'],
    ['Ctrl+S', { key: 's', ctrlKey: true }, 'catalogue.save'],
    ['Ctrl+D', { key: 'd', ctrlKey: true }, 'catalogue.clone'],
    ['Delete', { key: 'Delete' }, 'catalogue.delete'],
    ['Escape', { key: 'Escape' }, 'catalogue.discard'],
    ['/', { key: '/' }, 'catalogue.search'],
    ['ArrowUp', { key: 'ArrowUp' }, 'catalogue.previous'],
    ['ArrowDown', { key: 'ArrowDown' }, 'catalogue.next'],
    ['Alt+1 by physical key', { key: '&', code: 'Digit1', altKey: true }, 'catalogue.tab-pipe-classes'],
    ['Alt+2 on the numpad', { key: '2', code: 'Numpad2', altKey: true }, 'catalogue.tab-fitting-standards'],
    ['Alt+3', { key: '3', code: 'Digit3', altKey: true }, 'catalogue.tab-control-valves'],
    ['? (shared Help)', { key: '?', shiftKey: true }, 'help.shortcuts'],
  ])('on the page %s finds %s', (_n, init, id) => {
    expect(findCommandForKey(press(init), 'catalogue')?.id).toBe(id);
  });

  it.each([
    ['Backspace', { key: 'Backspace' }],
    ['Ctrl+C', { key: 'c', ctrlKey: true }],
    ['Ctrl+V', { key: 'v', ctrlKey: true }],
    ['Ctrl+A', { key: 'a', ctrlKey: true }],
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
    ['r', { key: 'r' }],
    ['Ctrl+Enter', { key: 'Enter', ctrlKey: true }],
    ['Ctrl+E (browser)', { key: 'e', ctrlKey: true }],
    ['Shift+Delete', { key: 'Delete', shiftKey: true }],
  ])('on the page %s is no command', (_n, init) => {
    expect(findCommandForKey(press(init), 'catalogue')).toBeNull();
  });

  it('the same keys still mean the drawing commands on the drawing', () => {
    expect(findCommandForKey(press({ key: 'Backspace' }))?.id).toBe('edit.delete');
    expect(findCommandForKey(press({ key: 'Enter', ctrlKey: true }))?.id).toBe('simulation.run');
    expect(findCommandForKey(press({ key: 'n' }))).toBeNull();
  });

  it('only Save fires inside text fields, on both pages', () => {
    const all = [...getPageDefinition('catalogue').commands, ...COMMANDS, ...KEY_ONLY_COMMANDS].filter((c) => c.firesInInputs);
    expect(all.map((c) => c.id).sort()).toEqual(['catalogue.save', 'file.save']);
  });
});

describe('shortcutGroups', () => {
  it.each(['drawing', 'catalogue'])('lists every bound command of the %s page with keys and a label', (page) => {
    const def = getPageDefinition(page);
    const rows = shortcutGroups(page).flatMap((g) => g.shortcuts);
    expect(rows).toHaveLength([...def.commands, ...def.keyOnlyCommands].filter((c) => c.shortcut).length);
    rows.forEach((r) => {
      expect(r.keys.length).toBeGreaterThan(0);
      expect(r.label).toBeTruthy();
    });
  });

  it('the Catalogue list holds its own keys and none of the drawing keys', () => {
    const keys = shortcutGroups('catalogue').flatMap((g) => g.shortcuts.map((s) => s.keys.join('+')));
    expect(keys).toEqual(expect.arrayContaining(['N', 'E', 'Ctrl+S', 'Ctrl+D', 'Delete', 'Esc', 'Alt+1', 'Alt+2', 'Alt+3', '/', 'Up', 'Down', 'Shift+?']));
    ['Ctrl+Z', 'Ctrl+Enter', 'R'].forEach((k) => expect(keys).not.toContain(k));
    expect(shortcutGroups('drawing').flatMap((g) => g.shortcuts.map((s) => s.keys.join('+')))).not.toContain('Alt+1');
  });

  it('given a context, the Catalogue list omits the keys hidden for that user and lists them for a manager', () => {
    const keysFor = (canManage) => shortcutGroups('catalogue', catalogueCtx({ canManage })).flatMap((g) => g.shortcuts.map((s) => s.keys.join('+')));
    const writeKeys = ['N', 'E', 'Ctrl+D', 'Delete', 'Ctrl+S', 'Esc'];
    const readOnly = keysFor(false);
    writeKeys.forEach((k) => expect(readOnly, k).not.toContain(k));
    expect(readOnly).toEqual(expect.arrayContaining(['/', 'Up', 'Down', 'Alt+1']));
    expect(keysFor(true)).toEqual(expect.arrayContaining(writeKeys));
  });
});
