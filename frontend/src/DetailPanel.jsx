import React, { useState } from 'react';
import PumpDetails from './details/PumpDetails';
import ValveDetails from './details/ValveDetails';
import FilterDetails from './details/FilterDetails';
import OrificeDetails from './details/OrificeDetails';
import JunctionDetails from './details/JunctionDetails';
import GenericDetails from './details/GenericDetails';

export default function DetailPanel({ selectedNode, allNodes, allEdges }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!selectedNode) return null;

  const { type, data } = selectedNode;

  const renderContent = () => {
    switch (type) {
      case 'pump':
      case 'centrifugal_pump':
      case 'volumetric_pump':
        return <PumpDetails node={selectedNode} />;
      case 'linear_control_valve':
      case 'linear_regulator':
      case 'remote_control_valve':
        return <ValveDetails node={selectedNode} />;
      case 'filter':
        return <FilterDetails node={selectedNode} />;
      case 'orifice':
        return <OrificeDetails node={selectedNode} />;
      case 'splitter':
      case 'mixer':
        return <JunctionDetails 
          node={selectedNode} 
          allNodes={allNodes} 
          allEdges={allEdges} 
        />;
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
      maxHeight: isCollapsed ? 'auto' : 'calc(100vh - 400px)',
      background: '#ffffff',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      zIndex: 10,
      padding: isCollapsed ? '10px 20px' : '20px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px',
      transition: 'all 0.2s ease-in-out'
    }}>
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: isCollapsed ? 'none' : '1px solid #f1f5f9', 
          paddingBottom: isCollapsed ? '0' : '10px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#0f172a', fontWeight: 'bold' }}>
            {data.label || type.toUpperCase()}
          </h3>
        </div>
        {!isCollapsed && (
          <span style={{ fontSize: '10px', color: '#94a3b8', background: '#f8fafc', padding: '2px 6px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
            {type.toUpperCase()}
          </span>
        )}
      </div>

      {!isCollapsed && renderContent()}
    </div>
  );
}
