import React from 'react';
import { useUnits } from '../../context/UnitContext';
import { ResultRow } from './ResultBlocks';

/**
 * A line pressure of a relief device in the basis the user chose: one gauge row, or the absolute row followed by
 * its gauge value in a row of its own (the gauge value is a result, not part of the unit). `pPa` is absolute in Pa,
 * `pBarg` the same pressure in bar g; both null while there is no result.
 */
export default function LinePressureRows({ label, pPa, pBarg }) {
  const { labels, formatGaugeValue, formatPressurePa, pressureBasis } = useUnits();
  const none = pPa == null || pBarg == null;
  const gaugeRow = (text) => <ResultRow label={text} value={none ? null : formatGaugeValue(pBarg)} unit={none ? null : labels.pressureGauge} />;
  if (pressureBasis === 'gauge') return gaugeRow(label);
  return (
    <>
      <ResultRow label={label} value={none ? null : formatPressurePa(pPa)} unit={none ? null : labels.pressureAbs} />
      {gaugeRow(`${label} (gauge)`)}
    </>
  );
}
