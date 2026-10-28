import { useUnits } from '../../context/UnitContext';
import { junctionPortCount } from '../../utils/junctionLayout';
import { NO_FLOW_M3S } from '../../utils/nodeReadouts';

// Flow is positive into the junction; a port without a pipe has no result
function directionOf(flow) {
  if (Math.abs(flow) < NO_FLOW_M3S) return 'no flow';
  return flow > 0 ? 'into junction' : 'out of junction';
}

/** Per-port results of a junction: flow magnitude and direction, static pressure and temperature. */
export default function JunctionPortsDetails({ node }) {
  const { labels, formatFlowM3s, formatPressurePa, formatTemperatureK } = useUnits();
  const count = junctionPortCount(node.data);
  const ports = node.data?.telemetry?.ports || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '800', color: 'var(--color-brand-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px', marginBottom: '8px' }}>
        Port Results
      </div>
      {Array.from({ length: count }, (_, k) => {
        const p = ports[k];
        return (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px',
            fontSize: 'var(--fs-xs)', background: 'var(--color-surface-hover)', padding: '6px 8px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>Port {k + 1}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{p ? directionOf(p.flow_rate || 0) : 'not connected'}</span>
            </div>
            {p && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: '700', color: 'var(--color-primary-text)' }}>
                  {formatFlowM3s(Math.abs(p.flow_rate || 0))} <span style={{ fontWeight: '500' }}>{labels.flow}</span>
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{formatPressurePa(p.pressure)} {labels.pressureAbs}</div>
                <div style={{ color: 'var(--color-text-secondary)' }}>{formatTemperatureK(p.temperature)} {labels.temperature}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
