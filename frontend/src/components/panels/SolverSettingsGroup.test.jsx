import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SolverSettingsGroup from './SolverSettingsGroup';
import { BUILTIN_SOLVER_SETTINGS } from '../../utils/settingsLevels';

const values = { ...BUILTIN_SOLVER_SETTINGS };

afterEach(cleanup);

describe('solver settings group', () => {
  it('is greyed out with its source while the level is not ticked', () => {
    const { container } = render(
      <SolverSettingsGroup values={values} onChange={() => {}} inheritedFrom="global"
        toggle={{ checked: false, onChange: () => {}, label: 'Use drawing solver settings' }} />
    );
    expect(container.querySelector('fieldset').disabled).toBe(true);
    expect(screen.getByText(/from Global/)).toBeTruthy();
  });

  it('becomes editable when ticked, and reports a valid edit', () => {
    const onChange = vi.fn();
    const onToggle = vi.fn();
    const { container, rerender } = render(
      <SolverSettingsGroup values={values} onChange={onChange}
        toggle={{ checked: false, onChange: onToggle, label: 'Use drawing solver settings' }} />
    );
    fireEvent.click(screen.getByLabelText('Use drawing solver settings'));
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(
      <SolverSettingsGroup values={values} onChange={onChange}
        toggle={{ checked: true, onChange: onToggle, label: 'Use drawing solver settings' }} />
    );
    expect(container.querySelector('fieldset').disabled).toBe(false);
    const tolerance = screen.getByDisplayValue('0.000001');
    fireEvent.focus(tolerance);
    fireEvent.change(tolerance, { target: { value: '1e-7' } });
    fireEvent.blur(tolerance);
    expect(onChange).toHaveBeenCalledWith({ tolerance: 1e-7 });
  });

  it('ignores an out-of-range value', () => {
    const onChange = vi.fn();
    render(<SolverSettingsGroup values={values} onChange={onChange} />);
    const tolerance = screen.getByDisplayValue('0.000001');
    fireEvent.focus(tolerance);
    fireEvent.change(tolerance, { target: { value: '5' } });
    fireEvent.blur(tolerance);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a non-owner from changing the project level', () => {
    const { container } = render(
      <SolverSettingsGroup values={values} onChange={() => {}} readOnly
        toggle={{ checked: true, onChange: () => {}, label: 'Use project solver settings', disabled: true, disabledHint: 'Only project owners can change the project solver settings.' }} />
    );
    expect(container.querySelector('fieldset').disabled).toBe(true);
    expect(screen.getByLabelText('Use project solver settings').disabled).toBe(true);
    expect(screen.getAllByText(/Only project owners/).length).toBeGreaterThan(0);
  });

  it('says when a higher level takes precedence', () => {
    render(<SolverSettingsGroup values={values} onChange={() => {}} overriddenBy="drawing"
      toggle={{ checked: true, onChange: () => {}, label: 'Use project solver settings' }} />);
    expect(screen.getByText('Drawing', { selector: 'strong' })).toBeTruthy();
  });
});
