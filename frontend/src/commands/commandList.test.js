import { describe, it, expect } from 'vitest';
import { runCommand, getCommand } from './commandList';
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
  it('the manager command is checked by showReliefScenarios and toggles through its action', () => {
    expect(getCommand('view.case-manager')).toBeUndefined();
    const command = getCommand('view.relief-scenarios');
    expect(command.label).toBe('Relief scenario manager');
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
    expect(children.map((c) => c.id)).toEqual(['view.relief-view.mitigated', 'view.relief-view.peak', 'view.relief-view.unmitigated_global']);
    expect(children.map((c) => c.checked)).toEqual([false, true, false]);
    children[2].run();
    expect(ctx.actions.setTelemetryMode).toHaveBeenCalledWith('unmitigated_global');
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
