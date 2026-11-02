import React from 'react';
import PumpDetails from './PumpDetails';
import ValveDetails from './ValveDetails';
import FilterDetails from './FilterDetails';
import OrificeDetails from './OrificeDetails';
import JunctionDetails from './JunctionDetails';
import JunctionPortsDetails from './JunctionPortsDetails';
import GenericDetails from './GenericDetails';
import PressureSafetyValveDetails from './PressureSafetyValveDetails';
import RuptureDiscDetails from './RuptureDiscDetails';

export default function ResultsPanel({ selectedNode, selectedEdge, allNodes, allEdges, unmitigatedTelemetry }) {
  if (!selectedNode && !selectedEdge) return null;

  const isEdge = !!selectedEdge;
  const type = isEdge ? 'pipe' : selectedNode.type;

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
      case 'tank':
      case 'pressure_boundary':
      case 'flow_boundary':
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

  return <div className="result-list">{renderContent()}</div>;
}
