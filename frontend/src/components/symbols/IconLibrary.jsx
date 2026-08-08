import React from 'react';

const baseSvgProps = (size, color) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: { display: 'inline-block', verticalAlign: 'middle' }
});

export const PlusIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const CloudIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </svg>
);

export const ExportIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export const ImportIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="8 12 12 16 16 12" />
    <line x1="12" y1="2" x2="12" y2="16" />
  </svg>
);

export const TrashIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const CrownIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
    <path d="M5 20h14" />
  </svg>
);

export const SignOutIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const SignInIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

export const PaletteIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C4.85857 19 4.5 20 4 21C3.5 22 4.5 22 5.5 21.5C6.5 21 7.5 20.5414 7.5 20.5414C8.88081 21.4883 10.5186 22 12 22Z" />
    <circle cx="7.5" cy="10.5" r="1.5" fill={color} />
    <circle cx="11.5" cy="7.5" r="1.5" fill={color} />
    <circle cx="16.5" cy="9.5" r="1.5" fill={color} />
  </svg>
);

export const CaseIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

export const HelpIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const CheckIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CrossIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const PlayIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} fill={color} {...props}>
    <polygon points="5 3 19 12 5 21" />
  </svg>
);

export const InfoIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const UserIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const BookIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

export const KeyboardIcon = ({ size = 16, color = 'currentColor', ...props }) => (
  <svg {...baseSvgProps(size, color)} {...props}>
    <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
    <line x1="6" y1="8" x2="6.01" y2="8" />
    <line x1="10" y1="8" x2="10.01" y2="8" />
    <line x1="14" y1="8" x2="14.01" y2="8" />
    <line x1="18" y1="8" x2="18.01" y2="8" />
    <line x1="6" y1="12" x2="6.01" y2="12" />
    <line x1="10" y1="12" x2="10.01" y2="12" />
    <line x1="14" y1="12" x2="14.01" y2="12" />
    <line x1="18" y1="12" x2="18.01" y2="12" />
    <line x1="7" y1="16" x2="17" y2="16" />
  </svg>
);
