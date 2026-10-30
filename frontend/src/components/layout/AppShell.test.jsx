import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AppShell from './AppShell';
import MenuBar from './MenuBar';
import CommandBar from './CommandBar';
import { makeCommandCtx } from '../../test/commandCtx';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ currentUser: null, isAuthenticated: false, isAdmin: false, adminStatus: {}, logout: vi.fn() }) }));

afterEach(cleanup);

const shell = (props = {}) => render(
  <AppShell
    header={<><button type="button">Header action</button>{props.headerExtra}</>}
    rail={<nav className="shell-rail" aria-label="Side panes"><button type="button" className="rail-button">Components</button></nav>}
    paneTitle="Components" pane={<input aria-label="Search components" />} paneOpen paneOverlay
    canvas={<div>canvas</div>} results={null} inspector={null} status={null}
    {...props}
  />
);
const esc = () => fireEvent.keyDown(document.body, { key: 'Escape' });

describe('header landmark', () => {
  it('holds the menu bar and the command bar in one banner', () => {
    const ctx = makeCommandCtx();
    shell({ header: <><MenuBar ctx={ctx} /><CommandBar ctx={ctx} /></> });
    const banner = screen.getByRole('banner');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(banner.contains(screen.getByRole('menubar', { name: 'Main menu' }))).toBe(true);
    expect(banner.contains(screen.getByRole('toolbar', { name: 'Commands' }))).toBe(true);
  });
});

describe('overlay side pane dismissal', () => {
  it('closes on Esc and returns focus to the rail', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane });
    esc();
    expect(onClosePane).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Components' }));
  });

  it('closes on a click outside the pane, but not inside the pane, rail or command bar', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane });
    fireEvent.pointerDown(screen.getByLabelText('Search components'));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Components' }));
    expect(onClosePane).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText('canvas'));
    expect(onClosePane).toHaveBeenCalledTimes(1);
  });

  it('consumes the canvas gesture that dismisses the pane, once', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane });
    const canvas = screen.getByText('canvas');
    const seen = [];
    ['mousedown', 'mouseup', 'click'].forEach((t) => canvas.addEventListener(t, () => seen.push(t)));
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(down);
    expect(onClosePane).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(true);
    fireEvent.mouseDown(canvas);
    fireEvent.mouseUp(canvas);
    fireEvent.click(canvas);
    expect(seen).toEqual([]);
    fireEvent.click(canvas); // the gesture is over: later clicks pass
    expect(seen).toEqual(['click']);
  });

  it('closes on a click in another region without consuming it', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane, status: <div>status bar</div> });
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    screen.getByText('status bar').dispatchEvent(down);
    expect(onClosePane).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(false);
  });

  it('leaves Esc to an open menu', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane, headerExtra: <div role="menu" aria-label="File" /> });
    esc();
    expect(onClosePane).not.toHaveBeenCalled();
  });

  it('leaves Esc to a focused input', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane });
    const input = screen.getByLabelText('Search components');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClosePane).not.toHaveBeenCalled();
  });

  it('does nothing while the pane is docked', () => {
    const onClosePane = vi.fn();
    shell({ onClosePane, paneOverlay: false });
    esc();
    fireEvent.pointerDown(screen.getByText('canvas'));
    expect(onClosePane).not.toHaveBeenCalled();
  });
});
