import { describe, it, expect } from 'vitest';
import {
  runCommand, getCommand, listCommandsByMenu, shortcutGroups, COMMANDS, KEY_ONLY_COMMANDS, PAGE_REASON,
} from './commandList';
import { makeCommandCtx } from '../test/commandCtx';

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

describe('commands while the Catalogue page is open', () => {
  const works = new Set(['tools.catalogue', 'tools.admin', 'help.guide', 'help.shortcuts', 'help.model', 'help.about']);
  const onPage = makeCommandCtx({ page: 'catalogue', isAdmin: true });

  it.each(COMMANDS.filter((c) => !works.has(c.id)).map((c) => [c.id]))('%s is disabled with the page reason and does not run', (id) => {
    const ctx = makeCommandCtx({ page: 'catalogue' });
    expect(getCommand(id).isEnabled(ctx)).toBe(PAGE_REASON);
    expect(runCommand(id, ctx)).toBe(false);
  });

  it.each([...works])('%s stays enabled', (id) => {
    expect(getCommand(id).isEnabled(onPage)).toBe(true);
  });

  it('the canvas-only keys are disabled too', () => {
    KEY_ONLY_COMMANDS.forEach((c) => expect(c.isEnabled(onPage), c.id).toBe(PAGE_REASON));
  });

  it('a missing ctx.page counts as the drawing, so no command reports the page reason', () => {
    const ctx = makeCommandCtx();
    expect(ctx.page).toBeUndefined();
    [...COMMANDS, ...KEY_ONLY_COMMANDS].forEach((c) => {
      expect(c.isEnabled(ctx), c.id).not.toBe(PAGE_REASON);
      expect(c.isEnabled(ctx), c.id).toEqual(c.isEnabled(makeCommandCtx({ page: 'drawing' })));
    });
  });

  it('Tools > Catalogue is a toggle: checked only on the page, and it runs toggleCatalogue from both', () => {
    const catalogue = getCommand('tools.catalogue');
    expect(catalogue.checked(onPage)).toBe(true);
    expect(catalogue.checked(makeCommandCtx({ page: 'drawing' }))).toBe(false);
    expect(catalogue.checked(makeCommandCtx())).toBe(false);
    [onPage, makeCommandCtx()].forEach((ctx) => {
      expect(runCommand('tools.catalogue', ctx)).toBe(true);
      expect(ctx.actions.toggleCatalogue).toHaveBeenCalledTimes(1);
    });
  });
});

describe('shortcutGroups', () => {
  it('lists every bound command with its keys and a label, whatever the command kind', () => {
    const rows = shortcutGroups().flatMap((g) => g.shortcuts);
    expect(rows).toHaveLength([...COMMANDS, ...KEY_ONLY_COMMANDS].filter((c) => c.shortcut).length);
    rows.forEach((r) => {
      expect(r.keys.length).toBeGreaterThan(0);
      expect(r.label).toBeTruthy();
    });
  });
});
