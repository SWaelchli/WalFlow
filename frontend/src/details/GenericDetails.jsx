import React from 'react';
import { paToBar, m3sToLmin } from '../utils/converters';

export default function GenericDetails({ node }) {
  const data = node.data;
  const telemetry = data.telemetry;

  if (!telemetry) {
    return (
      <div style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
        No simulation data available. Click "Calculate Network" to generate results.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
        <tbody>
          {telemetry.inlets?.map((p, i) => (
            <tr key={`in-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '4px 0', color: '#64748b' }}>Inlet {i} P:</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold' }}>{paToBar(p.pressure)} bar</td>
            </tr>
          ))}
          {telemetry.outlets?.map((p, i) => (
            <tr key={`out-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '4px 0', color: '#64748b' }}>Outlet {i} P:</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold' }}>{paToBar(p.pressure)} bar</td>
            </tr>
          ))}
          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: '4px 0', color: '#64748b' }}>Flow Rate:</td>
            <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 'bold' }}>
              {m3sToLmin(telemetry.inlets?.[0]?.flow_rate || 0)} L/min
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
