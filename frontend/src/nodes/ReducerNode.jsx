import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import { useUnits } from '../context/UnitContext';

/**
 * Reducer / Expander Component Node (ASME B16.9 / Custom)
 */
export default function ReducerNode({ id, data, selected }) {
  const { formatPressurePa, labels, isImperial } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);

  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;
  const dPFormatted = formatPressurePa(dP);

  const isEccentric = data.reducer_type === 'eccentric';
  const dIn = Number(data.diameter_in || 0.07792);
  const dOut = Number(data.diameter_out || 0.05248);
  const isReducing = dIn >= dOut;

  // Pretty size label
  const dnLarge = data.dn_large || 80;
  const dnSmall = data.dn_small || 50;
  const sizeLabel = data.standard === 'ASME_B16_9'
    ? (isImperial ? `${data.nps_large || '3"' } × ${data.nps_small || '2"'}` : `DN${dnLarge} → DN${dnSmall}`)
    : (isImperial ? `${(dIn * 39.3701).toFixed(1)}" → ${(dOut * 39.3701).toFixed(1)}"` : `${(dIn * 1000).toFixed(0)}mm → ${(dOut * 1000).toFixed(0)}mm`);

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={54}
      height={44}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
            {data.label || sizeLabel}
          </div>
          <div style={{ fontSize: '8px', color: 'var(--color-text-secondary)', fontStyle: 'italic', marginTop: '1px' }}>
            {isEccentric ? 'ECCENTRIC' : 'CONCENTRIC'}
          </div>
          {telemetry && (
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: dP >= 0 ? 'var(--color-danger)' : 'var(--color-primary)', marginTop: '2px' }}>
              {dP >= 0 ? `-${dPFormatted}` : `+${formatPressurePa(Math.abs(dP))}`} {labels.pressureDiff}
            </div>
          )}
        </>
      }
    >
      <svg width="54" height="44" viewBox="0 0 54 44">
        {/* Draw concentric or eccentric fitting body */}
        {isEccentric ? (
          // Eccentric Flat-on-Top trapezoid
          isReducing ? (
            <polygon points="10,10 44,10 44,28 10,36" fill="#FFFFFF" stroke="var(--color-brand-dark)" strokeWidth="2.2" strokeLinejoin="round" />
          ) : (
            <polygon points="10,10 44,10 44,36 10,28" fill="#FFFFFF" stroke="var(--color-brand-dark)" strokeWidth="2.2" strokeLinejoin="round" />
          )
        ) : (
          // Concentric symmetrical trapezoid
          isReducing ? (
            <polygon points="10,8 44,14 44,30 10,36" fill="#FFFFFF" stroke="var(--color-brand-dark)" strokeWidth="2.2" strokeLinejoin="round" />
          ) : (
            <polygon points="10,14 44,8 44,36 10,30" fill="#FFFFFF" stroke="var(--color-brand-dark)" strokeWidth="2.2" strokeLinejoin="round" />
          )
        )}

        {/* Port connecting pipe stubs */}
        <line x1="2" y1="22" x2="10" y2="22" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <line x1="44" y1="22" x2="52" y2="22" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        
        {/* Centerline */}
        <line x1="10" y1="22" x2="44" y2="22" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2,2" />
      </svg>

      <Handle
        type="target"
        position={getRotatedPosition(Position.Left, rotation)}
        id="inlet-0"
        className="handle-inlet"
        style={{
          top: '22px', left: '0px',
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-inlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['inlet-0'] && <SensingPin portId="inlet-0" offset={{ x: -20, y: 0 }} />}

      <Handle
        type="source"
        position={getRotatedPosition(Position.Right, rotation)}
        id="outlet-0"
        className="handle-outlet"
        style={{
          top: '22px', left: '54px',
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px'
        }}
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
    </BaseNode>
  );
}
