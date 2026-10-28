import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import DialogHost from './DialogHost';
import { notify, confirmDialog, askName, confirmDiscard, resetDialogs } from '../../utils/dialogs';

afterEach(() => { cleanup(); act(() => resetDialogs()); vi.useRealTimers(); });

describe('dialog service', () => {
  it('shows a toast and shows the same message only once', () => {
    render(<DialogHost />);
    act(() => { notify('Saved.', 'success'); notify('Saved.', 'success'); });
    expect(screen.getAllByText(/Saved\./)).toHaveLength(1);
  });

  it('removes a toast after its time', () => {
    vi.useFakeTimers();
    render(<DialogHost />);
    act(() => { notify('Short lived', 'info'); });
    expect(screen.getByText(/Short lived/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByText(/Short lived/)).toBeNull();
  });

  it('errors are announced as alerts', () => {
    render(<DialogHost />);
    act(() => { notify('It broke', 'error'); });
    expect(screen.getByRole('alert').textContent).toMatch(/It broke/);
  });

  it('confirm resolves true on the confirm button and false on cancel', async () => {
    render(<DialogHost />);
    let result;
    act(() => { result = confirmDialog({ title: 'Delete?', message: 'Really?', confirmLabel: 'Delete', danger: true }); });
    const dialog = screen.getByRole('alertdialog', { name: 'Delete?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByText('Really?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await result).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => { result = confirmDialog('Again?'); });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await result).toBe(false);
  });

  it('Escape cancels', async () => {
    render(<DialogHost />);
    let result;
    act(() => { result = confirmDiscard('switch'); });
    expect(screen.getByText(/Discard them and switch\?/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(await result).toBe(false);
  });

  it('puts focus in the dialog, keeps Tab inside, and gives focus back', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    render(<DialogHost />);
    let result;
    act(() => { result = confirmDialog({ message: 'Go?', confirmLabel: 'Go' }); });
    const go = screen.getByRole('button', { name: 'Go' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(go);
    // DOM order is Cancel, Go: Tab on the last button wraps to the first, Shift+Tab on the first wraps to the last
    fireEvent.keyDown(go, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(go);
    fireEvent.click(cancel);
    await result;
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('askName returns the trimmed name, refuses an empty one, and null on cancel', async () => {
    render(<DialogHost />);
    let result;
    act(() => { result = askName({ title: 'New case', label: 'Name', initial: 'Case 2', confirmLabel: 'Create' }); });
    const input = screen.getByLabelText('Name');
    expect(input.value).toBe('Case 2');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Create' }).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '  Winter  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await result).toBe('Winter');

    act(() => { result = askName({}); });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await result).toBeNull();
  });

  it('queues a second question behind the first', async () => {
    render(<DialogHost />);
    let first; let second;
    act(() => { first = confirmDialog('First?'); second = confirmDialog('Second?'); });
    expect(screen.getByText('First?')).toBeTruthy();
    expect(screen.queryByText('Second?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await first).toBe(true);
    expect(screen.getByText('Second?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await second).toBe(false);
  });
});

describe('no native dialogs left', () => {
  it('src has no window.alert / confirm / prompt calls', () => {
    const files = import.meta.glob(['../../**/*.{js,jsx}', '!../../**/*.test.{js,jsx}'], { query: '?raw', import: 'default', eager: true });
    const native = /(?:^|[^.\w'"-])(?:window\.)?(?:alert|confirm|prompt)\(/m;
    const offenders = Object.entries(files)
      .filter(([path]) => !path.endsWith('dialogs.js'))
      .filter(([, text]) => native.test(text.replace(/\/\/.*$/gm, '')))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
