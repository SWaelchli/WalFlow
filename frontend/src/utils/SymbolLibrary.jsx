import React from 'react';

export const EquipmentSymbol = ({ type, size = 40, style = {} }) => {
  const baseWidth = 60;
  const baseHeight = 60;
  
  // Custom dimensions for specific types
  const dimensions = {
    tank: { w: 60, h: 100 },
    orifice: { w: 40, h: 60 },
    splitter: { w: 40, h: 40 },
    mixer: { w: 40, h: 40 },
    filter: { w: 60, h: 40 },
  };

  const { w: width, h: height } = dimensions[type] || { w: baseWidth, h: baseHeight };
  
  // Scale factor to fit the 'size' prop while maintaining aspect ratio
  const scale = size / Math.max(width, height);


  const renderSVG = () => {
    switch (type) {
      case 'tank':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <path d="M 10 20 L 10 80 Q 10 95 30 95 Q 50 95 50 80 L 50 20 Q 50 5 30 5 Q 10 5 10 20 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <rect x="10" y="40" width="40" height="40" fill="#3b82f633" />
          </svg>
        );
      case 'centrifugal_pump':
      case 'pump':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <circle cx="30" cy="35" r="20" fill="white" stroke="#334155" strokeWidth="2.5" />
            <line x1="30" y1="15" x2="30" y2="55" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
            <line x1="10" y1="35" x2="50" y2="35" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
            <line x1="30" y1="15" x2="60" y2="15" stroke="#334155" strokeWidth="2.5" />
          </svg>
        );
      case 'volumetric_pump':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <circle cx="30" cy="35" r="20" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M30 20 L40 35 L30 50 L20 35 Z" fill="none" stroke="#334155" strokeWidth="1.5" />
            <line x1="30" y1="15" x2="30" y2="55" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
            <line x1="10" y1="35" x2="50" y2="35" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
            <line x1="30" y1="15" x2="60" y2="15" stroke="#334155" strokeWidth="2.5" />
          </svg>
        );
      case 'linear_control_valve':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
            <path d="M 20 15 Q 30 5 40 15 Z" fill="white" stroke="#334155" strokeWidth="1.5" />
            <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          </svg>
        );
      case 'remote_control_valve':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
            <path d="M 20 15 Q 30 5 40 15 Z" fill="#fef08a" stroke="#854d0e" strokeWidth="1.5" />
            <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
          </svg>
        );
      case 'linear_regulator':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="30" y1="35" x2="30" y2="15" stroke="#334155" strokeWidth="1.5" />
            <path d="M 15 15 L 45 15" stroke="#334155" strokeWidth="2.5" />
            <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <line x1="15" y1="15" x2="10" y2="20" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
          </svg>
        );
      case 'three_way_tcv':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <path d="M 10 20 L 30 35 L 10 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 20 60 L 30 35 L 40 60 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 50 20 L 30 35 L 50 50 Z" fill="white" stroke="#334155" strokeWidth="2.5" />
            <circle cx="30" cy="35" r="2.5" fill="#334155" />
            <rect x="24" y="5" width="12" height="12" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
            <line x1="30" y1="17" x2="30" y2="35" stroke="#334155" strokeWidth="1.5" />
            <text x="30" y="14" textAnchor="middle" style={{ fontSize: '8px', fontWeight: '800', fill: '#334155' }}>T</text>
          </svg>
        );
      case 'orifice':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="20" y1="10" x2="20" y2="25" stroke="#334155" strokeWidth="2.5" />
            <line x1="20" y1="35" x2="20" y2="50" stroke="#334155" strokeWidth="2.5" />
            <line x1="0" y1="30" x2="40" y2="30" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,4" />
          </svg>
        );
      case 'filter':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <rect x="5" y="5" width="50" height="30" fill="white" stroke="#334155" strokeWidth="2.5" />
            <line x1="5" y1="35" x2="55" y2="5" stroke="#334155" strokeWidth="2.5" />
          </svg>
        );
      case 'heat_exchanger':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <circle cx="30" cy="30" r="25" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 10 30 L 20 20 L 30 40 L 40 20 L 50 30" fill="none" stroke="#334155" strokeWidth="2" />
          </svg>
        );
      case 'splitter':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <circle cx="20" cy="20" r="15" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 5 20 L 15 20" stroke="#334155" strokeWidth="1.5" />
            <path d="M 25 15 L 35 10" stroke="#334155" strokeWidth="1.5" />
            <path d="M 25 25 L 35 30" stroke="#334155" strokeWidth="1.5" />
          </svg>
        );
      case 'mixer':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <circle cx="20" cy="20" r="15" fill="white" stroke="#334155" strokeWidth="2.5" />
            <path d="M 5 10 L 15 15" stroke="#334155" strokeWidth="1.5" />
            <path d="M 5 30 L 15 25" stroke="#334155" strokeWidth="1.5" />
            <path d="M 25 20 L 35 20" stroke="#334155" strokeWidth="1.5" />
          </svg>
        );
      default:
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <rect x="5" y="5" width="50" height="50" fill="white" stroke="#334155" strokeWidth="2.5" strokeDasharray="4,4" />
          </svg>
        );
    }
  };

  return (
    <div style={{ 
      width: size, 
      height: size, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      overflow: 'visible',
      ...style 
    }}>
      <div style={{ 
        transform: `scale(${scale})`, 
        transformOrigin: 'center center',
        width: width,
        height: height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {renderSVG()}
      </div>
    </div>
  );
};
