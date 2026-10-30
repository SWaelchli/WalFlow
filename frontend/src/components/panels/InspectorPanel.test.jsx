import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InspectorPanel from './InspectorPanel';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(cleanup);

describe('inspector header', () => {
  it('Collapse inspector calls onCollapse and does not delete', () => {
    const node = { id: 'n1', type: 'tank', position: { x: 0, y: 0 }, data: { label: 'T-1' } };
    const onCollapse = vi.fn();
    const onDelete = vi.fn();
    render(
      <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
        <InspectorPanel node={node} effectiveNode={node} onUpdate={vi.fn()} onDelete={onDelete} onCollapse={onCollapse} setActiveTab={vi.fn()} cases={[]} allNodes={[node]} allEdges={[]} />
      </UnitProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
