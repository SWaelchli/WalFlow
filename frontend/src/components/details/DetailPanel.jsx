import React, { useState } from 'react';
import PumpDetails from './PumpDetails';
import ValveDetails from './ValveDetails';
import FilterDetails from './FilterDetails';
import OrificeDetails from './OrificeDetails';
import JunctionDetails from './JunctionDetails';
import GenericDetails from './GenericDetails';

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
      case 'three_way_tcv':
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
      width: '320px',
      maxHeight: isCollapsed ? 'auto' : 'calc(100vh - 360px)',
      background: '#ffffff',
      borderRadius: '12px',
      border: '1px solid #D8E2E1',
      boxShadow: '0 10px 25px -3px rgba(57, 82, 83, 0.15), 0 4px 6px -2px rgba(57, 82, 83, 0.05)',
      zIndex: 10,
      padding: isCollapsed ? '12px 18px' : '20px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: isCollapsed ? 'none' : '1px solid #EBF0EF', 
          paddingBottom: isCollapsed ? '0' : '10px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#587071', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#395253', fontWeight: '700', letterSpacing: '0.01em' }}>
            {data.label || type.toUpperCase()}
          </h3>
        </div>
        {!isCollapsed && (
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#FA8507', background: 'rgba(250, 133, 7, 0.12)', padding: '3px 8px', borderRadius: '12px' }}>
            {type.toUpperCase()}
          </span>
        )}
      </div>

      {!isCollapsed && renderContent()}
    </div>
  );
}

