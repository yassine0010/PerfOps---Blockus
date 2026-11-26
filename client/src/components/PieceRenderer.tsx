import React from 'react';
import { PlayerColor } from '../../../shared/index';

interface PieceRendererProps {
  shape: number[][];
  color: PlayerColor;
  size?: number; // cell size in px (default 16)
  className?: string;
}

const COLOR_MAP: Record<PlayerColor, { fill: string; stroke: string; highlight: string }> = {
  BLUE: { fill: '#3E82F7', stroke: '#2563EB', highlight: '#93C5FD' },
  YELLOW: { fill: '#F5A623', stroke: '#D97706', highlight: '#FDE68A' },
  RED: { fill: '#E64A4A', stroke: '#DC2626', highlight: '#FCA5A5' },
  GREEN: { fill: '#38A169', stroke: '#059669', highlight: '#86EFAC' }
};

export const PieceRenderer = React.memo<PieceRendererProps>(({
  shape,
  color,
  size = 14,
  className = ''
}) => {
  const rows = shape.length;
  const cols = shape[0].length;
  const colors = COLOR_MAP[color] || COLOR_MAP.BLUE;

  const gap = 1.5;
  const totalWidth = cols * size + (cols - 1) * gap;
  const totalHeight = rows * size + (rows - 1) * gap;

  return (
    <svg
      width={totalWidth}
      height={totalHeight}
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      className={`piece-svg ${className}`}
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.highlight} stopOpacity="0.8" />
          <stop offset="40%" stopColor={colors.fill} />
          <stop offset="100%" stopColor={colors.stroke} />
        </linearGradient>
      </defs>
      {shape.map((row, r) =>
        row.map((cell, c) => {
          if (cell !== 1) return null;
          const x = c * (size + gap);
          const y = r * (size + gap);
          return (
            <g key={`${r}-${c}`}>
              {/* Drop shadow / bevel */}
              <rect
                x={x}
                y={y}
                width={size}
                height={size}
                rx={size * 0.22}
                fill={`url(#grad-${color})`}
                stroke={colors.stroke}
                strokeWidth={1}
              />
              {/* Inner shine pill */}
              <rect
                x={x + size * 0.15}
                y={y + size * 0.15}
                width={size * 0.7}
                height={size * 0.28}
                rx={size * 0.12}
                fill="#FFFFFF"
                opacity={0.35}
              />
            </g>
          );
        })
      )}
    </svg>
  );
});
