import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PageStatusBar from './PageStatusBar';

afterEach(cleanup);

describe('PageStatusBar', () => {
  it.each([
    [1, 'Custom', true, '1 entry', 'Source: Custom', 'Can edit'],
    [0, 'All', false, '0 entries', 'Source: All', 'Read-only'],
    [12, 'TR2000', false, '12 entries', 'Source: TR2000', 'Read-only'],
  ])('shows count, source and role (%s, %s, canEdit %s)', (count, filterLabel, canEdit, c, s, r) => {
    // No ReactFlow or auth provider around it: the bar must not read canvas state
    render(<PageStatusBar count={count} filterLabel={filterLabel} canEdit={canEdit} />);
    expect(screen.getByText(c)).toBeTruthy();
    expect(screen.getByText(s)).toBeTruthy();
    expect(screen.getByText(r)).toBeTruthy();
    expect(screen.queryByText(canEdit ? 'Read-only' : 'Can edit')).toBeNull();
  });
});
