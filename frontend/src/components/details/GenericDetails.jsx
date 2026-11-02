import { ArrowRightIcon } from '../symbols/IconLibrary';
import React from 'react';
import { useUnits } from '../../context/UnitContext';
import { isNeutralPort, NEUTRAL_TYPES } from '../../utils/networkValidation';
import { portTitle } from '../../utils/portLabels';
import { neutralPorts, heatExchangerReadout } from '../../utils/nodeReadouts';
import NeutralFlowCaption from './NeutralFlowCaption';
import { ResultSection, ResultTable, ResultRow, ResultCallout } from './ResultBlocks';

export default function GenericDetails({ node, edge, allNodes = [], allEdges = [] }) {
  const { labels, formatPressurePa, formatDiffPressurePa, formatFlowM3s, formatTemperatureK, formatVelocity, formatPressureGradient, formatDimensionless, formatHeatDuty } = useUnits();
  const isEdge = !!edge;
  const item = node || edge;
  if (!item) return null;

  const data = item.data || {};
  const telemetry = data.telemetry;

  if (!telemetry) {
    return (
      <ResultSection title="Operational Telemetry">
        <ResultCallout tone="info">No simulation data available. Run a simulation to see the results.</ResultCallout>
      </ResultSection>
    );
  }

  // Common variables
  const inlets = telemetry.inlets || [];
  const outlets = telemetry.outlets || [];

  // A two-port component has neutral ports: its upstream side is the port the flow enters through
  const neutral = !isEdge && NEUTRAL_TYPES.has(node.type) ? neutralPorts(telemetry) : null;

  // Determine flow direction and rates
  const flowM3s = neutral ? neutral.flow : (outlets[0]?.flow_rate ?? inlets[0]?.flow_rate ?? 0);
  const isReverse = !neutral && flowM3s < 0;

  // Dynamic upstream/downstream based on flow direction
  let pUp = 0;
  let pDown = 0;
  let temp = 293.15;

  if (neutral) {
    pUp = neutral.up.pressure ?? 101325;
    pDown = neutral.down.pressure ?? 101325;
    temp = neutral.up.temperature ?? neutral.down.temperature ?? 293.15;
  } else if (isReverse) {
    pUp = outlets[0]?.pressure ?? 101325;
    pDown = inlets[0]?.pressure ?? 101325;
    temp = outlets[0]?.temperature ?? inlets[0]?.temperature ?? 293.15;
  } else {
    pUp = inlets[0]?.pressure ?? 101325;
    pDown = outlets[0]?.pressure ?? 101325;
    temp = inlets[0]?.temperature ?? outlets[0]?.temperature ?? 293.15;
  }

  const dpPa = Math.max(0, pUp - pDown);

  // Visual Flow Path for Node or Pipe (exactly 2 items, clean black text, no dynamic colors)
  let upLabel = "SOURCE";
  let downLabel = "TARGET";

  const nameOf = (n, fallback) => n?.data?.label || n?.type?.replace('_', ' ').toUpperCase() || fallback;
  // Name of a pipe end; "Port k" is added where the port has no role
  const endName = (n, handle, fallback) => (n && isNeutralPort(n, handle) ? `${nameOf(n, fallback)} (${portTitle(n, handle)})` : nameOf(n, fallback));
  let flowCaption = null;

  if (isEdge) {
    const srcNode = allNodes.find(n => n.id === edge.source);
    const tgtNode = allNodes.find(n => n.id === edge.target);
    const srcLabel = nameOf(srcNode, 'SOURCE');
    const tgtLabel = nameOf(tgtNode, 'TARGET');
    upLabel = isReverse ? tgtLabel : srcLabel;
    downLabel = isReverse ? srcLabel : tgtLabel;
    // Positive flow runs from the drawn source end to the target end; the caption names the ends in flow direction
    const ends = [endName(srcNode, edge.sourceHandle || 'outlet-0', 'SOURCE'), endName(tgtNode, edge.targetHandle || 'inlet-0', 'TARGET')];
    if (isReverse) ends.reverse();
    flowCaption = `Flow ${formatFlowM3s(Math.abs(flowM3s))} ${labels.flow}, ${ends[0]} → ${ends[1]}`;
  } else {
    const selfLabel = data.label || node.type?.replace('_', ' ').toUpperCase() || 'COMPONENT';
    // The neighbour across the pipe(s) on the upstream / downstream port, whichever way the pipe was drawn
    const neighbours = (matches) => allEdges
      .filter(e => e.data?.type !== 'SIGNAL')
      .flatMap((e) => {
        if (e.source === node.id && matches(e.sourceHandle || 'outlet-0')) return [e.target];
        if (e.target === node.id && matches(e.targetHandle || 'inlet-0')) return [e.source];
        return [];
      });
    const resolve = (matches) => {
      const ids = neighbours(matches);
      return ids.length === 1 ? nameOf(allNodes.find(n => n.id === ids[0]), selfLabel) : selfLabel;
    };
    const isTwoPort = NEUTRAL_TYPES.has(node.type);
    const upHandle = `port-${neutral?.upIdx ?? 0}`;
    const downHandle = `port-${neutral?.downIdx ?? 1}`;
    const resolvedUpstreamLabel = resolve(isTwoPort ? (h) => h === upHandle : (h) => h.startsWith('inlet-'));
    const resolvedDownstreamLabel = resolve(isTwoPort ? (h) => h === downHandle : (h) => h.startsWith('outlet-'));

    upLabel = isReverse ? resolvedDownstreamLabel : resolvedUpstreamLabel;
    downLabel = isReverse ? resolvedUpstreamLabel : resolvedDownstreamLabel;
  }

  const flowPathCard = (
    <div className="result-flowpath">
      <div className="result-flowpath-end">{upLabel}</div>
      <ArrowRightIcon size={14} color="var(--color-text-secondary)" />
      <div className="result-flowpath-end">{downLabel}</div>
    </div>
  );

  const flowCaptionRow = flowCaption && <div className="result-caption">{flowCaption}</div>;

  // Heat exchanger: duty and temperature change, the same values as its canvas readout
  let heatRows = null;
  if (!isEdge && node.type === 'heat_exchanger') {
    const { dutyKw, deltaTK } = heatExchangerReadout(telemetry);
    heatRows = (
      <>
        <ResultRow label="Heat Duty" title="Positive when the fluid is cooled" value={Math.abs(dutyKw) < 0.01 ? '0' : formatHeatDuty(dutyKw)} unit={labels.heatDuty} />
        <ResultRow label="Temperature Change (ΔT)" title="Outlet minus inlet" value={formatDimensionless(deltaTK, 'temperatureDiff')} unit="K" />
      </>
    );
  }

  // Pipe details
  let pipeRows = null;
  if (isEdge) {
    const diameter = data.diameter_m || 0.1;
    const length = data.length_m ?? 25.0;
    const area = Math.PI * Math.pow(diameter, 2) / 4.0;
    const velocity = area > 0 ? Math.abs(flowM3s) / area : 0;

    // Reynolds Number
    const density = inlets[0]?.density || 1000;
    const viscosity = inlets[0]?.viscosity || 0.001; // Pa.s
    const re = viscosity > 0 ? (density * velocity * diameter) / viscosity : 0;

    // Flow regime
    let regime = 'Laminar';
    if (re > 4000) regime = 'Turbulent';
    else if (re >= 2000) regime = 'Transition';

    pipeRows = (
      <>
        <ResultRow label="Fluid Velocity" value={formatVelocity(velocity)} unit={labels.velocity} />
        <ResultRow label="Reynolds Number" value={<>{formatDimensionless(re, 'reynolds')}<span className="result-unit">{regime}</span></>} />
        <ResultRow label="Pressure Gradient" value={formatPressureGradient(dpPa, length)} unit={labels.pressureGradient} />
      </>
    );
  }

  return (
    <ResultSection title="Operational Telemetry">
      {flowPathCard}
      {flowCaptionRow}
      {neutral && <NeutralFlowCaption telemetry={telemetry} />}

      <ResultTable>
        <ResultRow label="Upstream Pressure" value={formatPressurePa(pUp)} unit={labels.pressureAbs} />
        <ResultRow label="Downstream Pressure" value={formatPressurePa(pDown)} unit={labels.pressureAbs} />
        <ResultRow label="Pressure Drop (ΔP)" value={formatDiffPressurePa(dpPa, 3)} unit={labels.pressureDiff} />
        <ResultRow label="Flow Rate" value={formatFlowM3s(Math.abs(flowM3s))} unit={labels.flow} />
        <ResultRow label="Temperature" value={formatTemperatureK(temp)} unit={labels.temperature} />
        {heatRows}
        {pipeRows}
      </ResultTable>
    </ResultSection>
  );
}
