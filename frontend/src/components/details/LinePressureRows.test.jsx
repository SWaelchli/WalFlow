import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { UnitProvider } from '../../context/UnitContext';
import { UNIT_SYSTEMS } from '../../utils/converters';
import LinePressureRows from './LinePressureRows';

afterEach(() => { cleanup(); localStorage.clear(); });

// 4 bar a with 1.01325 bar atmosphere is 2.99 bar g
const rowsFor = (basis, props) => {
  localStorage.setItem('walflow_pressure_basis', basis);
  const { container } = render(
    <UnitProvider initialUnitSystem={UNIT_SYSTEMS.METRIC}>
      <table><tbody><LinePressureRows label="Inlet pressure" {...props} /></tbody></table>
    </UnitProvider>
  );
  return Array.from(container.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent));
};

describe('LinePressureRows', () => {
  it.each([
    ['absolute basis: absolute row, then a gauge row of its own', 'absolute', { pPa: 400000, pBarg: 2.98675 }, [['Inlet pressure', '4.00bar a'], ['Inlet pressure (gauge)', '2.99bar g']]],
    ['gauge basis: one gauge row under the plain label', 'gauge', { pPa: 400000, pBarg: 2.98675 }, [['Inlet pressure', '2.99bar g']]],
    ['absolute basis before a result: both rows are dashes', 'absolute', { pPa: null, pBarg: null }, [['Inlet pressure', '—'], ['Inlet pressure (gauge)', '—']]],
    ['gauge basis before a result: a dash', 'gauge', { pPa: null, pBarg: null }, [['Inlet pressure', '—']]],
    ['a missing gauge value hides both values', 'absolute', { pPa: 400000, pBarg: null }, [['Inlet pressure', '—'], ['Inlet pressure (gauge)', '—']]],
  ])('%s', (_n, basis, props, expected) => {
    expect(rowsFor(basis, props)).toEqual(expected);
  });
});
