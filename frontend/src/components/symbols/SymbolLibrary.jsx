import React from 'react';

export const EquipmentSymbol = ({ type, size = 40, style = {} }) => {
  const baseWidth = 60;
  const baseHeight = 60;

  // Custom dimensions for specific types
  const dimensions = {
    tank: { w: 60, h: 100 },
    orifice: { w: 40, h: 60 },
    calibrated_restriction: { w: 40, h: 60 },
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
      case 'check_valve':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="10" y1="20" x2="10" y2="50" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="10" cy="20" r="3.5" fill="#334155" />
            <line x1="50" y1="20" x2="50" y2="50" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="10" y1="20" x2="48" y2="46" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <polygon points="50,48 39,44 45,37" fill="#334155" stroke="#334155" strokeWidth="0.5" />
          </svg>
        );
      case 'check_valve_orifice':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="10" y1="20" x2="10" y2="50" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="10" cy="20" r="3.5" fill="#334155" />
            <line x1="50" y1="20" x2="50" y2="50" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="10" y1="20" x2="48" y2="46" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
            <polygon points="50,48 39,44 45,37" fill="#334155" stroke="#334155" strokeWidth="0.5" />
            <circle cx="30" cy="35" r="4" fill="white" stroke="#334155" strokeWidth="1.5" />
            <circle cx="30" cy="35" r="1.5" fill="#334155" />
          </svg>
        );
      case 'pressure_safety_valve':
      case 'psv':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="10" y1="35" x2="25" y2="35" stroke="#334155" strokeWidth="2.5" />
            <line x1="45" y1="35" x2="60" y2="35" stroke="#334155" strokeWidth="2.5" />
            <polygon points="25,23 25,47 35,35" fill="white" stroke="#334155" strokeWidth="2" />
            <polygon points="45,23 45,47 35,35" fill="white" stroke="#334155" strokeWidth="2" />
            <line x1="35" y1="35" x2="35" y2="12" stroke="#334155" strokeWidth="2" />
            <rect x="29" y="8" width="12" height="10" fill="#f8fafc" stroke="#334155" strokeWidth="1.8" rx="2" />
            <line x1="32" y1="11" x2="38" y2="11" stroke="#334155" strokeWidth="1.5" />
            <line x1="32" y1="13.5" x2="38" y2="13.5" stroke="#334155" strokeWidth="1.5" />
            <line x1="32" y1="16" x2="38" y2="16" stroke="#334155" strokeWidth="1.5" />
          </svg>
        );
      case 'rupture_disc':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="10" y1="35" x2="28" y2="35" stroke="#334155" strokeWidth="2.5" />
            <line x1="42" y1="35" x2="60" y2="35" stroke="#334155" strokeWidth="2.5" />
            <rect x="26" y="22" width="3" height="26" fill="#334155" rx="1" />
            <rect x="41" y="22" width="3" height="26" fill="#334155" rx="1" />
            <path d="M 29,24 Q 35,35 29,46" fill="none" stroke="var(--color-primary)" strokeWidth="3" />
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
      case 'calibrated_restriction':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <line x1="20" y1="10" x2="20" y2="22" stroke="#334155" strokeWidth="2.5" />
            <line x1="20" y1="38" x2="20" y2="50" stroke="#334155" strokeWidth="2.5" />
            <line x1="0" y1="30" x2="40" y2="30" stroke="#334155" strokeWidth="1.5" strokeDasharray="3,3" />
            <circle cx="20" cy="30" r="6" fill="white" stroke="var(--color-primary)" strokeWidth="2" />
            <circle cx="20" cy="30" r="2.5" fill="var(--color-brand-dark)" />
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
      case 'text_bubble':
        return (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <rect x="5" y="10" width="50" height="40" rx="6" fill="#FFFFFF" stroke="#D8E2E1" strokeWidth="2" />
            <line x1="12" y1="20" x2="40" y2="20" stroke="var(--color-brand-dark)" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="28" x2="48" y2="28" stroke="#587071" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="36" x2="32" y2="36" stroke="#587071" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="45" cy="18" r="2.5" fill="var(--color-primary)" />
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
