import { useUnits } from '../../context/UnitContext';
import { portNumberLabel } from '../../utils/portLabels';
import { neutralPorts, NO_FLOW_M3S } from '../../utils/nodeReadouts';

/** Solved flow through a two-port component: "Flow 12.3 m³/h, Port 2 → Port 1" (nothing before a result). */
export default function NeutralFlowCaption({ telemetry }) {
  const { labels, formatFlowM3s } = useUnits();
  const s = neutralPorts(telemetry);
  if (!s) return null;
  return (
    <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>
      Flow {formatFlowM3s(s.flow)} {labels.flow}{s.flow < NO_FLOW_M3S ? '' : `, ${portNumberLabel(s.upIdx)} → ${portNumberLabel(s.downIdx)}`}
    </div>
  );
}
