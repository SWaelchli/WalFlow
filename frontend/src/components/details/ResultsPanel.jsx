import { CaretDownIcon } from '../symbols/IconLibrary';
import React, { useState } from 'react';
import PumpDetails from './PumpDetails';
import ValveDetails from './ValveDetails';
import FilterDetails from './FilterDetails';
import OrificeDetails from './OrificeDetails';
import JunctionDetails from './JunctionDetails';
import JunctionPortsDetails from './JunctionPortsDetails';
import GenericDetails from './GenericDetails';
import PressureSafetyValveDetails from './PressureSafetyValveDetails';
import RuptureDiscDetails from './RuptureDiscDetails';

import { clickableProps } from '../../utils/a11yProps';
export default function ResultsPanel({ selectedNode, selectedEdge, allNodes, allEdges, unmitigatedTelemetry, inline = false }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!selectedNode && !selectedEdge) return null;

  const isEdge = !!selectedEdge;
  const item = selectedNode || selectedEdge;
  const type = isEdge ? 'pipe' : item.type;
  const data = item.data || {};

  const renderContent = () => {
    if (isEdge) {
      return <GenericDetails edge={selectedEdge} allNodes={allNodes} allEdges={allEdges} />;
    }

    switch (type) {
      case 'pump':
      case 'centrifugal_pump':
      case 'volumetric_pump':
        return <PumpDetails node={selectedNode} />;
      case 'linear_control_valve':
      case 'linear_regulator':
      case 'remote_control_valve':
        return <ValveDetails node={selectedNode} />;
      case 'pressure_safety_valve':
      case 'psv':
        return <PressureSafetyValveDetails node={selectedNode} unmitigatedTelemetry={unmitigatedTelemetry} allNodes={allNodes} />;
      case 'rupture_disc':
        return <RuptureDiscDetails node={selectedNode} unmitigatedTelemetry={unmitigatedTelemetry} />;
      case 'filter':
        return <FilterDetails node={selectedNode} />;
      case 'orifice':
        return <OrificeDetails node={selectedNode} />;
      case 'junction':
        return <JunctionPortsDetails node={selectedNode} />;
      case 'three_way_tcv':
        return <JunctionDetails 
          node={selectedNode} 
          allNodes={allNodes} 
          allEdges={allEdges} 
        />;
      default:
        return <GenericDetails node={selectedNode} allNodes={allNodes} allEdges={allEdges} />;
    }
  };

  if (inline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {renderContent()}
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      left: '20px',
      top: '20px',
      width: '320px',
      maxHeight: isCollapsed ? 'auto' : 'calc(100vh - 360px)',
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-lg)',
      zIndex: 10,
      padding: isCollapsed ? '12px 18px' : '20px',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div {...clickableProps} 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: isCollapsed ? 'none' : '1px solid var(--color-border)', 
          paddingBottom: isCollapsed ? '0' : '10px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CaretDownIcon size={12} color="var(--color-text-secondary)" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          <h3 style={{ margin: 0, fontSize: 'var(--fs-md)', color: 'var(--color-brand-dark)', fontWeight: '700', letterSpacing: '0.01em' }}>
            {data.label || (isEdge ? `PIPE (${item.id.replace('reactflow__edge-', '')})` : type.toUpperCase())}
          </h3>
        </div>
        {!isCollapsed && (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: 'var(--color-primary-text)', background: 'var(--color-primary-tint)', padding: '3px 8px', borderRadius: '12px' }}>
            {type.toUpperCase()}
          </span>
        )}
      </div>

      {!isCollapsed && renderContent()}
    </div>
  );
}

