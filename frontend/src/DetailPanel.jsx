import React from 'react';
import PumpDetails from './details/PumpDetails';
import RegulatorDetails from './details/RegulatorDetails';
import GenericDetails from './details/GenericDetails';

export default function DetailPanel({ selectedNode }) {
  if (!selectedNode) return null;

  const { type, data } = selectedNode;

  const renderContent = () => {
    switch (type) {
      case 'pump':
        return <PumpDetails node={selectedNode} />;
      case 'linear_regulator':
        return <RegulatorDetails node={selectedNode} />;
      default:
        return <GenericDetails node={selectedNode} />;
    }
  };

  return (
    <div style={{
      position: 'absolute',
      left: '20px',
      top: '20px',
      width: '300px',
      maxHeight: 'calc(100vh - 400px)',
      background: '#ffffff',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      zIndex: 10,
      padding: '20px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', color: '#0f172a', fontWeight: 'bold' }}>
          {data.label || type.toUpperCase()}
        </h3>
        <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f8fafc', padding: '2px 6px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
          {type.toUpperCase()}
        </span>
      </div>

      {renderContent()}
    </div>
  );
}
