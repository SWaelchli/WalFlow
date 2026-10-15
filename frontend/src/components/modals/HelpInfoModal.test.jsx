// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import HelpInfoModal from './HelpInfoModal';

describe('HelpInfoModal (F3-07, F2-27)', () => {
  it('is an accessible dialog named by its title, and focus stays inside on Tab', () => {
    render(<div><button>opener</button><HelpInfoModal isOpen onClose={() => {}} initialTab="guide" /></div>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy).textContent).toMatch(/Help/);
    const focusables = [...dialog.querySelectorAll('button, a[href]')];
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('returns focus to the opener when closed', () => {
    const { rerender } = render(<div><button data-testid="opener">opener</button><HelpInfoModal isOpen={false} onClose={() => {}} /></div>);
    screen.getByTestId('opener').focus();
    rerender(<div><button data-testid="opener">opener</button><HelpInfoModal isOpen onClose={() => {}} /></div>);
    expect(document.activeElement).not.toBe(screen.getByTestId('opener'));
    rerender(<div><button data-testid="opener">opener</button><HelpInfoModal isOpen={false} onClose={() => {}} /></div>);
    expect(document.activeElement).toBe(screen.getByTestId('opener'));
  });

  it('guide uses current UI wording and no raw LaTeX', () => {
    const { container } = render(<HelpInfoModal isOpen onClose={() => {}} initialTab="guide" />);
    expect(screen.getByText(/Run Simulation/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Calculate/);
    expect(container.textContent).not.toMatch(/\$|\circ|\frac/);
  });

  it('model tab documents steady state, Darcy-Weisbach and the IEC 60534 simplification', () => {
    render(<HelpInfoModal isOpen onClose={() => {}} initialTab="shortcuts" />);
    fireEvent.click(screen.getByRole('button', { name: /Model & Limits/ }));
    expect(screen.getByText(/steady-state/)).toBeTruthy();
    expect(screen.getByText('Darcy-Weisbach')).toBeTruthy();
    expect(screen.getByText(/IEC 60534-2-1/)).toBeTruthy();
    expect(screen.getByText(/water hammer/)).toBeTruthy();
  });

  it('close button has an accessible name', () => {
    const onClose = vi.fn();
    render(<HelpInfoModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    expect(onClose).toHaveBeenCalled();
  });
});
