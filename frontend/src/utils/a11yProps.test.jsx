// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { clickableProps, clickableRowProps } from './a11yProps';

describe('clickableProps', () => {
  it('makes a div focusable, a button, and activates on Enter and Space', () => {
    const onClick = vi.fn();
    render(<div {...clickableProps} onClick={onClick}>Open</div>);
    const el = screen.getByRole('button', { name: 'Open' });
    expect(el.tabIndex).toBe(0);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: ' ' });
    fireEvent.keyDown(el, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores keys pressed inside a nested field', () => {
    const onClick = vi.fn();
    render(<div {...clickableRowProps} onClick={onClick}><input aria-label="x" /></div>);
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });
});
