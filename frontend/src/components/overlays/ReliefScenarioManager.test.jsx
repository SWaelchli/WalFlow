import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReliefScenarioManager from './ReliefScenarioManager';
import { UnitProvider } from '../../context/UnitContext';

afterEach(cleanup);

const mount = (props) => render(
  <UnitProvider initialUnitSystem="metric">
    <ReliefScenarioManager cases={[]} {...props} />
  </UnitProvider>,
);

describe('ReliefScenarioManager', () => {
  it('offers the three scenarios, marks the current one, has no case controls, and closes', () => {
    const onToggleTelemetryMode = vi.fn();
    const onClose = vi.fn();
    mount({ telemetryMode: 'peak', onToggleTelemetryMode, onClose });
    expect(screen.getByText('Relief scenario manager')).toBeTruthy();
    const choices = screen.getAllByRole('button', { name: /pressure/ });
    expect(choices.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    fireEvent.click(choices[2]);
    expect(onToggleTelemetryMode).toHaveBeenCalledWith('unmitigated_global');
    fireEvent.click(choices[0]);
    expect(onToggleTelemetryMode).toHaveBeenCalledWith('mitigated');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/New case/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close relief scenario manager' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
