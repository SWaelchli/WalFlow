import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MenuBar from './MenuBar';
import { getTabId } from '../../utils/draftStorage';
import { makeCommandCtx } from '../../test/commandCtx';

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

  it('runs an enabled item (Tools > Catalogue) and closes the menu', () => {
    const ctx = setup();
    fireEvent.click(trigger('Tools'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Catalogue' }));
    expect(ctx.actions.openCatalogue).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Tools' })).toBeNull();
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
  it('opens About from the logo', () => {
    const ctx = setup();
    fireEvent.click(screen.getByRole('button', { name: /^About/ }));
    expect(ctx.actions.openHelp).toHaveBeenCalledWith('about');
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
