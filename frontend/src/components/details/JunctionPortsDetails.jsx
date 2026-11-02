import { useUnits } from '../../context/UnitContext';
import { junctionPortCount } from '../../utils/junctionLayout';
import { boundaryPortCount, BOUNDARY_PORT_TYPES } from '../../utils/boundaryLayout';
import { NO_FLOW_M3S } from '../../utils/nodeReadouts';
import { ResultSection, ResultTable, ResultRow } from './ResultBlocks';

// Flow is positive into the component; a port without a pipe has no result
function directionOf(flow) {
  if (Math.abs(flow) < NO_FLOW_M3S) return 'No flow';
  return flow > 0 ? 'In' : 'Out';
}

/** Per-port results of a junction, tank or boundary: flow magnitude and direction, static pressure and temperature. */
export default function JunctionPortsDetails({ node }) {
  const { labels, formatFlowM3s, formatPressurePa, formatTemperatureK } = useUnits();
  const isBoundary = BOUNDARY_PORT_TYPES.has(node.type);
  const count = isBoundary ? boundaryPortCount(node.data) : junctionPortCount(node.data);
  const telemetryPorts = node.data?.telemetry?.ports;
  const ports = telemetryPorts || [];
  const indices = Array.from({ length: count }, (_, k) => k);
  // `absent` is shown for a port without a result: after a run that is a port with no pipe, before a run nothing yet
  const perPort = (fn, absent = null) => indices.map((k) => (ports[k] ? fn(ports[k]) : absent));

  return (
    <ResultSection title="Port Results">
      <ResultTable columns={indices.map((k) => `Port ${k + 1}`)}>
        <ResultRow label="Direction" text title="In: flow enters this component; Out: flow leaves it; Not connected: no pipe on this port"
          values={perPort((p) => directionOf(p.flow_rate || 0), telemetryPorts ? 'Not connected' : null)} />
        <ResultRow label="Flow" labelUnit={labels.flow} values={perPort((p) => formatFlowM3s(Math.abs(p.flow_rate || 0)))} />
        <ResultRow label="Pressure" labelUnit={labels.pressureAbs} values={perPort((p) => formatPressurePa(p.pressure))} />
        <ResultRow label="Temperature" labelUnit={labels.temperature} values={perPort((p) => formatTemperatureK(p.temperature))} />
      </ResultTable>
    </ResultSection>
  );
}
