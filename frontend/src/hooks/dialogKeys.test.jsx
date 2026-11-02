import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, renderHook, act } from '@testing-library/react';
import useEscapeKey from './useEscapeKey';
import useEnterKey from './useEnterKey';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useModalManager } from './useModalManager';
import { makeCommandCtx, makePageState } from '../test/commandCtx';

afterEach(() => { cleanup(); document.body.innerHTML = ''; });

const press = (init, target = window) => {
  const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
  target.dispatchEvent(event);
  return event;
};

function Dialog({ onEscape, onEnter, active = true, children }) {
  useEscapeKey(onEscape, active);
  useEnterKey(onEnter, active);
  return <div className="modal-overlay"><div className="modal-container">{children}</div></div>;
}

describe('Esc and Enter of a dialog', () => {
  it.each([
    ['Esc anywhere', { key: 'Escape' }, 'input', 'esc', true],
    ['Enter in a field', { key: 'Enter' }, 'input', 'enter', true],
    ['Enter on a button runs the button itself', { key: 'Enter' }, 'button', 'enter', false],
    ['Enter on a link runs the link itself', { key: 'Enter' }, 'a', 'enter', false],
    ['Enter in a select picks the option', { key: 'Enter' }, 'select', 'enter', false],
    ['Enter in a textarea is a new line', { key: 'Enter' }, 'textarea', 'enter', false],
    ['Esc in a textarea still closes', { key: 'Escape' }, 'textarea', 'esc', true],
    ['Ctrl+Enter is not Enter', { key: 'Enter', ctrlKey: true }, 'input', 'enter', false],
    ['Shift+Enter is not Enter', { key: 'Enter', shiftKey: true }, 'input', 'enter', false],
    ['a held-down Enter does not repeat the action', { key: 'Enter', repeat: true }, 'input', 'enter', false],
    ['Enter of an IME composition is not Enter', { key: 'Enter', isComposing: true }, 'input', 'enter', false],
    ['Esc of an IME composition is not Esc', { key: 'Escape', isComposing: true }, 'input', 'esc', false],
  ])('%s', (_name, init, tag, which, runs) => {
    const onEscape = vi.fn(); const onEnter = vi.fn();
    render(<Dialog onEscape={onEscape} onEnter={onEnter}>
      {tag === 'a' ? <a href="#x">link</a> : React.createElement(tag, null, tag === 'button' ? 'go' : undefined)}
    </Dialog>);
    const control = document.querySelector(tag);
    control.focus();
    const event = press(init, control);
    expect(event.defaultPrevented).toBe(runs);
    expect(which === 'esc' ? onEscape : onEnter).toHaveBeenCalledTimes(runs ? 1 : 0);
    expect(which === 'esc' ? onEnter : onEscape).not.toHaveBeenCalled();
  });

  it('an inactive dialog (action running, another dialog on top) takes neither key and leaves it to others', () => {
    const onEscape = vi.fn(); const onEnter = vi.fn();
    render(<Dialog onEscape={onEscape} onEnter={onEnter} active={false}><input /></Dialog>);
    expect(press({ key: 'Escape' }).defaultPrevented).toBe(false);
    expect(press({ key: 'Enter' }, document.querySelector('input')).defaultPrevented).toBe(false);
    expect(onEscape).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('a confirm or name dialog on top keeps both keys, a key somebody already handled is left alone', () => {
    const onEscape = vi.fn(); const onEnter = vi.fn();
    render(<Dialog onEscape={onEscape} onEnter={onEnter}><input /></Dialog>);
    const hostDialog = document.createElement('div');
    hostDialog.setAttribute('role', 'alertdialog');
    hostDialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(hostDialog);
    press({ key: 'Escape' });
    press({ key: 'Enter' }, document.querySelector('input'));
    expect(onEscape).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    hostDialog.remove();

    const handled = (e) => e.preventDefault();
    window.addEventListener('keydown', handled, true);
    press({ key: 'Escape' });
    press({ key: 'Enter' }, document.querySelector('input'));
    window.removeEventListener('keydown', handled, true);
    expect(onEscape).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('runs the latest callback, not the one of the first render', () => {
    const first = vi.fn(); const second = vi.fn();
    const { rerender } = render(<Dialog onEnter={first}><input /></Dialog>);
    rerender(<Dialog onEnter={second}><input /></Dialog>);
    press({ key: 'Enter' }, document.querySelector('input'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('Esc and Enter next to the page shortcuts', () => {
  function Page({ ctx, withDialog }) {
    useKeyboardShortcuts(ctx);
    const [open, setOpen] = useState(!!withDialog);
    return open ? <Dialog onEscape={() => setOpen(false)} onEnter={() => setOpen(false)}><input /></Dialog> : null;
  }

  it('the Esc that closes a dialog during editing does not also Discard; the next Esc does', () => {
    const ctx = makeCommandCtx({ page: 'catalogue', pageState: makePageState({ isEditing: true }) });
    render(<Page ctx={ctx} withDialog />);
    act(() => { press({ key: 'Escape' }); });
    expect(document.querySelector('.modal-overlay')).toBeNull();
    expect(ctx.pageState.actions.discard).not.toHaveBeenCalled();
    act(() => { press({ key: 'Escape' }); });
    expect(ctx.pageState.actions.discard).toHaveBeenCalledTimes(1);
  });

  it('the closing Esc is also left alone when the shortcuts listener runs before the dialog (which is still open then)', () => {
    const ctx = makeCommandCtx({ page: 'catalogue', pageState: makePageState({ isEditing: true }) });
    function ShortcutsFirst() {
      const [open, setOpen] = useState(true);
      useKeyboardShortcuts(ctx);
      useEscapeKey(() => setOpen(false));
      return open ? <div className="modal-overlay" /> : null;
    }
    render(<ShortcutsFirst />);
    act(() => { press({ key: 'Escape' }); });
    expect(ctx.pageState.actions.discard).not.toHaveBeenCalled();
  });

  it.each([
    ['inside a dialog', true, false],
    ['outside a dialog (inspector, side panes)', false, true],
  ])('Enter in a text field %s: the field is blurred only outside', (_n, inDialog, blurred) => {
    render(<>
      <Page ctx={makeCommandCtx()} />
      {inDialog ? <div className="modal-overlay"><input id="f" /></div> : <input id="f" />}
    </>);
    const input = document.getElementById('f');
    input.focus();
    press({ key: 'Enter' }, input);
    expect(document.activeElement === input).toBe(!blurred);
  });
});

describe('Esc of the dialogs the modal manager owns', () => {
  const open = () => {
    const hook = renderHook(() => useModalManager());
    act(() => hook.result.current.handleOpenAuthModal());
    return hook;
  };
  const isOpen = (hook) => hook.result.current.isAuthModalOpen;
  const overlay = (inner = '') => {
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.innerHTML = inner;
    document.body.appendChild(el);
    return el;
  };

  it('closes the open dialog', () => {
    const hook = open();
    overlay();
    act(() => { press({ key: 'Escape' }); });
    expect(isOpen(hook)).toBe(false);
  });

  it.each([
    ['another dialog is on top of it', () => { overlay(); overlay(); }],
    ['its action runs (aria-busy)', () => overlay('<div aria-busy="true"></div>')],
    ['a confirm dialog is on top', () => {
      overlay();
      const c = document.createElement('div');
      c.setAttribute('aria-modal', 'true');
      document.body.appendChild(c);
    }],
  ])('stays open while %s', (_n, setup) => {
    const hook = open();
    setup();
    act(() => { press({ key: 'Escape' }); });
    expect(isOpen(hook)).toBe(true);
  });

  it('stays open when somebody handled the key, and for other keys', () => {
    const hook = open();
    overlay();
    const handled = (e) => e.preventDefault();
    window.addEventListener('keydown', handled, true);
    act(() => { press({ key: 'Escape' }); });
    window.removeEventListener('keydown', handled, true);
    act(() => { press({ key: 'Enter' }); });
    expect(isOpen(hook)).toBe(true);
  });

  it('Help closes on Esc and Enter does nothing', () => {
    const hook = renderHook(() => useModalManager());
    act(() => hook.result.current.handleOpenHelpModal());
    overlay();
    act(() => { press({ key: 'Enter' }); });
    expect(hook.result.current.isHelpModalOpen).toBe(true);
    act(() => { press({ key: 'Escape' }); });
    expect(hook.result.current.isHelpModalOpen).toBe(false);
  });
});
