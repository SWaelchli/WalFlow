import { Handle, Position } from 'reactflow';
import { useMemo } from 'react';
import { getRotatedPosition } from '../components/canvas/NodeRotationHandle';
import { SensingPin } from '../components/canvas/SensingPin';
import BaseNode from './BaseNode';
import { useUnits } from '../context/UnitContext';

/**
 * Calibrated Restriction Node (Orifice, Laminar, or Quadratic)
 */
export default function CalibratedRestrictionNode({ id, data, selected }) {
  const { formatPressurePa, labels } = useUnits();
  const telemetry = data.telemetry;
  const rotation = data.rotation || 0;
  const sensing = useMemo(() => data.sensing || {}, [data.sensing]);
  const pIn = telemetry?.inlets?.[0]?.pressure || 0;
  const pOut = telemetry?.outlets?.[0]?.pressure || 0;
  const dP = pIn - pOut;
  const dPFormatted = formatPressurePa(dP);

  // Pretty model badge name
  const modelLabels = {
    orifice: 'Orifice',
    laminar: 'Laminar',
    quadratic: 'Quadratic',
  };
  const modelName = modelLabels[data.restriction_model] || 'Orifice';

  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      width={40}
      height={60}
      footer={
        <>
          <div style={{ fontSize: '9px', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
            {data.label || 'CAL. RESTRICTION'}
          </div>
          <div style={{ fontSize: '8px', color: 'var(--color-text-secondary)', fontStyle: 'italic', marginTop: '1px' }}>
            {modelName}
          </div>
          <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-danger)', marginTop: '2px' }}>
            -{dPFormatted} {labels.pressureDiff}
          </div>
        </>
      }
    >
      <svg width="40" height="60" viewBox="0 0 40 60">
        {/* Stylized calibrated orifice restriction symbol */}
        <line x1="20" y1="10" x2="20" y2="22" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <line x1="20" y1="38" x2="20" y2="50" stroke="var(--color-brand-dark)" strokeWidth="2.5" />
        <line x1="0" y1="30" x2="40" y2="30" stroke="var(--color-brand-dark)" strokeWidth="1.5" strokeDasharray="3,3" />
        {/* Calibrated dial indicator representing calibration */}
        <circle cx="20" cy="30" r="6" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="2" />
        <circle cx="20" cy="30" r="2.5" fill="var(--color-brand-dark)" />
      </svg>

      <Handle 
        type="target" 
        position={getRotatedPosition(Position.Left, rotation)} 
        id="inlet-0" 
        className="handle-inlet"
        style={{ 
          top: '30px', left: '0px', 
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
          top: '30px', left: '40px', 
          marginTop: '-4px', marginLeft: '-4px',
          right: 'auto', bottom: 'auto', transform: 'none',
          background: 'var(--color-outlet)', width: '8px', height: '8px' 
        }} 
      />
      {sensing['outlet-0'] && <SensingPin portId="outlet-0" offset={{ x: 20, y: 0 }} />}
    </BaseNode>
  );
}
