import React from 'react';

interface MascotProps {
  type: 'idle' | 'ready' | 'cheer';
  isBig?: boolean;
}

export const Mascot: React.FC<MascotProps> = ({ type, isBig = false }) => {
  return (
    <div className={`mascot ${type} ${type === 'idle' ? 'mascot-bounce' : ''} ${isBig ? 'big' : ''}`}>
      <svg viewBox="0 0 160 160" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="80" cy="150" rx="36" ry="7" fill="rgba(20,30,20,0.15)" />
        <ellipse cx="64" cy="139" rx="11" ry="8" fill="var(--mascot-dark)" />
        <ellipse cx="96" cy="139" rx="11" ry="8" fill="var(--mascot-dark)" />
        <ellipse cx="80" cy="86" rx="49" ry="53" fill="var(--mascot-body)" />
        <ellipse cx="80" cy="99" rx="30" ry="32" fill="var(--mascot-belly)" />
        <path d="M80,33 Q85,18 94,14" stroke="#2BB673" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="95" cy="12" r="5.5" fill="var(--sun)" />
        <g className="arm-left">
          <ellipse cx="32" cy="96" rx="11" ry="21" fill="#2BB673" />
        </g>
        <g className="arm-right">
          <ellipse cx="128" cy="96" rx="11" ry="21" fill="#2BB673" />
        </g>
        <g className="baton-prop" transform="rotate(25 134 100)">
          <rect x="130" y="78" width="8" height="38" rx="4" fill="#FF6B42" />
          <circle cx="134" cy="78" r="5" fill="#E0532E" />
        </g>
        <circle cx="61" cy="72" r="14.5" fill="#FFFFFF" />
        <circle cx="99" cy="72" r="14.5" fill="#FFFFFF" />
        <circle cx="63" cy="74" r="6.2" fill="#1E2A22" />
        <circle cx="101" cy="74" r="6.2" fill="#1E2A22" />
        <circle cx="47" cy="92" r="6.5" fill="#FFB6C1" opacity="0.85" />
        <circle cx="113" cy="92" r="6.5" fill="#FFB6C1" opacity="0.85" />
        <path d="M63,97 Q80,114 97,97" stroke="#1E2A22" strokeWidth="4.2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
};
