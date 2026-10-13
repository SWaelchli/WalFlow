import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SetupPanel from './SetupPanel';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';

vi.mock('axios', () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

afterEach(cleanup);

const pipeEdge = (data) => ({ id: 'e1', source: 'n1', target: 'n2', data: { type: 'PIPE', length: 25, ...data } });

const renderPanel = (edge, unitSystem) => {
  const onUpdateEdge = vi.fn();
  render(
    <UnitProvider initialUnitSystem={unitSystem}>
      <SetupPanel edge={edge} onUpdateEdge={onUpdateEdge} />
    </UnitProvider>
  );
  return onUpdateEdge;
};

describe('F2-01: pipe sizes picked in the inspector are stored in SI in imperial mode', () => {
  it('stores DN80 STD as 77.92 mm (3.068 in), not divided by 39.37', () => {
    const onUpdateEdge = renderPanel(pipeEdge({ pipe_class_id: 'manual', standardDn: 50, standardSch: 'STD', diameter: 0.05248 }), UNIT_SYSTEMS.IMPERIAL);
    fireEvent.change(screen.getByDisplayValue('DN 50 (2")'), { target: { value: '80' } });

    const updates = onUpdateEdge.mock.calls.at(-1)[1];
    expect(updates.standardDn).toBe(80);
    expect(updates.diameter).toBeCloseTo(0.07792, 6);
  });
});

describe('F2-08: free inner diameter commits on blur', () => {
  it('lets the user type 60 mm and commits once on blur', () => {
    // 60 mm matches no schedule, so the inspector opens in Free Dimensions mode
    const onUpdateEdge = renderPanel(pipeEdge({ diameter: 0.06 }), UNIT_SYSTEMS.METRIC);
    const input = screen.getByDisplayValue('60.00');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.change(input, { target: { value: '65' } });
    expect(onUpdateEdge).not.toHaveBeenCalled();
    expect(input.value).toBe('65');

    fireEvent.blur(input);
    expect(onUpdateEdge).toHaveBeenCalledTimes(1);
    expect(onUpdateEdge.mock.calls[0][1].diameter).toBeCloseTo(0.065, 9);
  });

  it('ignores an empty or zero diameter and shows the stored value again', () => {
    const onUpdateEdge = renderPanel(pipeEdge({ diameter: 0.06 }), UNIT_SYSTEMS.METRIC);
    const input = screen.getByDisplayValue('60.00');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(onUpdateEdge).not.toHaveBeenCalled();
    expect(input.value).toBe('60.00');
  });
});
