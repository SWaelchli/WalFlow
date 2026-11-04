import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MenuBar from './MenuBar';
import { APP_VERSION, RELEASE_STAGE } from '../../constants';
import { getTabId } from '../../utils/draftStorage';
import { makeCommandCtx, makePageState } from '../../test/commandCtx';

const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

const signedIn = (over = {}) => ({
  currentUser: { id: 'u1', username: 'me' }, isAuthenticated: true, isAdmin: false, adminStatus: {}, logout: vi.fn(), ...over,
});

afterEach(() => { cleanup(); auth.value = null; });

const setup = ({ user = signedIn(), ...props } = {}, ctxOver = {}) => {
  auth.value = user;
  const ctx = makeCommandCtx(ctxOver);
  render(<MenuBar ctx={ctx} {...props} />);
  return ctx;
};
const trigger = (name) => screen.getByRole('menuitem', { name });

describe('MenuBar menus', () => {
  it('opens File with its items', () => {
    setup();
    fireEvent.click(trigger('File'));
    expect(screen.getByRole('menu', { name: 'File' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Save(?! as)/ })).toBeTruthy();
  });

  it('shows the reason of a disabled item and does not run it', () => {
    const ctx = setup({}, { isAuthenticated: false });
    fireEvent.click(trigger('File'));
    const open = screen.getByRole('menuitem', { name: /^Open/ });
    expect(open.getAttribute('aria-disabled')).toBe('true');
    expect(open.getAttribute('title')).toBe('Sign in to open cloud drawings');
    fireEvent.click(open);
    expect(ctx.actions.openDrawings).not.toHaveBeenCalled();
  });

  it.each([
    ['drawing', undefined, 'false'],
    ['catalogue page', 'catalogue', 'true'],
  ])('Tools > Catalogue is a checkbox item that toggles and closes the menu: %s', (_n, page, checked) => {
    const ctx = setup({}, { page });
    fireEvent.click(trigger('Tools'));
    const item = screen.getByRole('menuitemcheckbox', { name: 'Catalogue' });
    expect(item.getAttribute('aria-checked')).toBe(checked);
    fireEvent.click(item);
    expect(ctx.actions.toggleCatalogue).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Tools' })).toBeNull();
  });

  it('on the Catalogue page the bar shows the page menus only, with no drawing command greyed out', () => {
    setup({}, { page: 'catalogue', pageState: makePageState() });
    const bar = screen.getByRole('menubar');
    expect([...bar.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent)).toEqual(['File', 'Edit', 'View', 'Tools', 'Help']);
    fireEvent.click(trigger('File'));
    expect(screen.queryByRole('menuitem', { name: /Save as|Open/ })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /^New pipe class…/ })).toBeTruthy();
  });

  it('the New label follows the tab, Import from TR2000 is on the pipe classes tab only', () => {
    setup({}, { page: 'catalogue', pageState: makePageState() });
    fireEvent.click(trigger('File'));
    expect(screen.getByRole('menuitem', { name: /Import from TR2000…/ })).toBeTruthy();
    cleanup();
    setup({}, { page: 'catalogue', pageState: makePageState({ tab: 'control_valves', entryLabel: 'control valve catalogue' }) });
    fireEvent.click(trigger('File'));
    expect(screen.getByRole('menuitem', { name: /^New control valve catalogue…/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /TR2000/ })).toBeNull();
  });

  it('page items run the page action; a disabled one shows its reason and does not run', () => {
    const ctx = setup({}, { page: 'catalogue', pageState: makePageState({ hasSelection: false, isEditing: false }) });
    fireEvent.click(trigger('Edit'));
    const clone = screen.getByRole('menuitem', { name: /^Clone selected/ });
    expect(clone.getAttribute('aria-disabled')).toBe('true');
    expect(clone.getAttribute('title')).toBe('Select an entry first');
    fireEvent.click(clone);
    expect(ctx.pageState.actions.clone).not.toHaveBeenCalled();
    if (!screen.queryByRole('menu', { name: 'Edit' })) fireEvent.click(trigger('Edit'));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Restore defaults…/ }));
    expect(ctx.pageState.actions.restoreDefaults).toHaveBeenCalledTimes(1);
  });

  it('the three catalogue tabs are radio items, ticked for the open tab', () => {
    setup({}, { page: 'catalogue', pageState: makePageState({ tab: 'fitting_standards' }) });
    fireEvent.click(trigger('View'));
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.map((r) => [r.textContent.replace(/Alt\+\d$/, ''), r.getAttribute('aria-checked')])).toEqual([
      ['Pipe classes', 'false'], ['Fitting standards', 'true'], ['Control valve styles', 'false'],
    ]);
  });

  it('a read-only user has no Edit menu, and arrow keys skip to the next visible menu', () => {
    setup({}, { page: 'catalogue', pageState: makePageState({ canManage: false }) });
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    trigger('File').focus();
    fireEvent.keyDown(trigger('File'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(trigger('View'));
    fireEvent.click(trigger('File'));
    const items = screen.getByRole('menu', { name: 'File' }).querySelectorAll('[role="menuitem"]');
    expect([...items].map((el) => el.textContent.replace(/\s+/g, ' ').trim())).toEqual(['Export library', 'Back to drawing']);
  });

  it('keyboard: Right moves, Down opens, Esc closes and refocuses the trigger', () => {
    setup();
    trigger('File').focus();
    fireEvent.keyDown(trigger('File'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(trigger('Edit'));
    fireEvent.keyDown(trigger('Edit'), { key: 'ArrowDown' });
    expect(trigger('Edit').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement.closest('[role="menu"]')).toBeTruthy();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Edit' })).toBeNull();
    expect(document.activeElement).toBe(trigger('Edit'));
  });

  it('closes on an outside click', () => {
    setup();
    fireEvent.click(trigger('File'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu', { name: 'File' })).toBeNull();
  });

  it('marks toggles as checkable and the active case as a radio', () => {
    setup({}, { canvasLocked: true });
    fireEvent.click(trigger('View'));
    expect(screen.getByRole('menuitemcheckbox', { name: /Lock canvas/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(trigger('Simulation'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Active case/ }));
    expect(screen.getByRole('menuitemradio', { name: /Base/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'Winter' }).getAttribute('aria-checked')).toBe('false');
  });

  it('View > Relief scenario lists the scenarios, a separator and the manager toggle; Heatmap has neither', () => {
    const ctx = setup({}, { showReliefScenarios: true });
    fireEvent.click(trigger('View'));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Relief scenario$/ }));
    const sub = screen.getByRole('menu', { name: 'Relief scenario' });
    const within = (role) => [...sub.querySelectorAll(`[role="${role}"]`)];
    expect(within('menuitemradio')).toHaveLength(3);
    expect(within('separator')).toHaveLength(1);
    expect(within('separator')[0].hasAttribute('data-menu-item')).toBe(false);
    const manager = within('menuitemcheckbox');
    expect(manager.map((m) => m.textContent)).toEqual(['Relief scenario manager']);
    expect(manager[0].getAttribute('aria-checked')).toBe('true');
    // Arrow keys walk the three scenarios and the manager, never the separator.
    const items = [...sub.querySelectorAll('[data-menu-item]')];
    expect(items).toHaveLength(4);
    items[2].focus();
    fireEvent.keyDown(items[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(manager[0]);
    fireEvent.keyDown(manager[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.click(manager[0]);
    expect(ctx.actions.toggleReliefScenarios).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Relief scenario' })).toBeNull();

    fireEvent.click(trigger('View'));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Heatmap$/ }));
    const heat = screen.getByRole('menu', { name: 'Heatmap' });
    expect(heat.querySelector('[role="menuitemcheckbox"], [role="separator"]')).toBeNull();
  });

  it('the manager toggle is unchecked when the manager is hidden', () => {
    setup({}, { showReliefScenarios: false });
    fireEvent.click(trigger('View'));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Relief scenario$/ }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Relief scenario manager' }).getAttribute('aria-checked')).toBe('false');
  });

  it.each([
    ['administrator', true],
    ['regular user', false],
  ])('Admin hub is listed only for an administrator: %s', (_n, isAdmin) => {
    setup({ user: signedIn({ isAdmin }) }, { isAdmin });
    fireEvent.click(trigger('Tools'));
    expect(!!screen.queryByRole('menuitem', { name: /Admin hub/ })).toBe(isAdmin);
  });
});

describe('MenuBar header', () => {
  it('a page name replaces the drawing name, save state and lock chip', () => {
    setup({
      activeDiagram: { id: 'd1', title: 'My drawing' }, saveStatus: 'error',
      lockInfo: { user_id: 'u2', username: 'alex' },
    }, { page: 'catalogue', pageState: makePageState() });
    expect(screen.getByText('Catalogue', { selector: '.menubar-doc-name' })).toBeTruthy();
    expect(screen.queryByText('My drawing')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Not saved')).toBeNull();
  });

  it('opens About from the logo', () => {
    const ctx = setup();
    fireEvent.click(screen.getByRole('button', { name: /^About/ }));
    expect(ctx.actions.openHelp).toHaveBeenCalledWith('about');
  });

  it('brand button name contains its visible version text, with the stage only when set', () => {
    setup();
    const brand = screen.getByRole('button', { name: /^About/ });
    const stage = RELEASE_STAGE ? ` • ${RELEASE_STAGE}` : '';
    expect(brand.getAttribute('aria-label')).toBe(`About WälFlow v${APP_VERSION}${stage}`);
    expect(brand.getAttribute('aria-label')).toContain(brand.textContent.replace(/\s+/g, ' ').trim());
  });

  it('offers Sign in when signed out', () => {
    const onOpenAuthModal = vi.fn();
    setup({ user: signedIn({ isAuthenticated: false, currentUser: null }), onOpenAuthModal });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onOpenAuthModal).toHaveBeenCalledTimes(1);
  });

  it('signs out from the user menu', () => {
    const user = signedIn();
    const onLogoutClear = vi.fn();
    setup({ user, onLogoutClear });
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /me/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(user.logout).toHaveBeenCalledTimes(1);
    expect(onLogoutClear).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['saving', { saveStatus: 'saving_cloud' }, 'Saving…'],
    ['error', { saveStatus: 'error' }, 'Not saved'],
    ['locked by another user', { isLockedByOther: true }, 'Read-only'],
    ['saved to cloud', { saveStatus: 'saved_cloud' }, 'Saved to cloud'],
  ])('save state: %s', (_n, props, label) => {
    setup(props);
    expect(screen.getByRole('status', { name: '' }).textContent).toBe(label);
  });

  describe('lock chip', () => {
    const diagram = { id: 'd1', title: 'D' };
    it.each([
      ['this tab holds the lock', () => ({ user_id: 'u1', username: 'me', session_id: getTabId() }), 'Editing', 'Editing'],
      ['same user, other tab', () => ({ user_id: 'u1', username: 'me', session_id: 'other-tab' }), 'Read-only · open in another tab of yours', 'Other tab'],
      ['another user', () => ({ user_id: 'u2', username: 'alex' }), 'Read-only · alex is editing', 'alex'],
      ['no lock', () => null, null, null],
    ])('%s', (_name, makeLock, label, short) => {
      setup({ activeDiagram: diagram, lockInfo: makeLock() });
      const chip = screen.queryByRole('status', { name: (n) => n.startsWith('Editing') || n.startsWith('Read-only') });
      if (label === null) expect(chip).toBeNull();
      else {
        expect(chip.getAttribute('aria-label')).toBe(label);
        expect(chip.querySelector('.lock-chip-label').textContent).toBe(label);
        expect(chip.querySelector('.lock-chip-short').textContent).toBe(short);
        expect(chip.querySelector('.lock-chip-short').getAttribute('aria-hidden')).toBe('true');
      }
    });
  });
});
