import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import EmptyCanvasHint from './EmptyCanvasHint';

afterEach(cleanup);

describe('EmptyCanvasHint', () => {
  it('calls onBrowseExamples once when the button is clicked', () => {
    const onBrowseExamples = vi.fn();
    render(<EmptyCanvasHint onBrowseExamples={onBrowseExamples} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse examples' }));
    expect(onBrowseExamples).toHaveBeenCalledTimes(1);
  });

  it('lets a drag pass through the button until the drag ends', () => {
    render(<EmptyCanvasHint />);
    const button = screen.getByRole('button', { name: 'Browse examples' });
    expect(button.style.pointerEvents).toBe('auto');
    fireEvent.dragEnter(document);
    expect(button.style.pointerEvents).toBe('none');
    fireEvent.drop(document);
    expect(button.style.pointerEvents).toBe('auto');
  });
});
