import { describe, it, expect } from 'vitest';
import { runCommand } from './commandList';
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
