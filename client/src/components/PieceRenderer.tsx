import React, { useLayoutEffect } from 'react';
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

const SHARED_DEFS_SVG_ID = 'blokus-shared-piece-defs';

function getSharedGradientId(color: PlayerColor): string {
  return `blokus-piece-grad-${color}`;
}

function ensureSharedPieceGradientDefs(): void {
  if (typeof document === 'undefined' || document.getElementById(SHARED_DEFS_SVG_ID)) {
    return;
  }

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('id', SHARED_DEFS_SVG_ID);
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'fixed';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  svg.style.pointerEvents = 'none';

  const defs = document.createElementNS(svgNs, 'defs');
  (Object.keys(COLOR_MAP) as PlayerColor[]).forEach((c) => {
    const palette = COLOR_MAP[c];
    const grad = document.createElementNS(svgNs, 'linearGradient');
    grad.setAttribute('id', getSharedGradientId(c));
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '0%');
    grad.setAttribute('y2', '100%');

    const stops: [string, string, string?][] = [
      ['0%', palette.highlight, '0.8'],
      ['40%', palette.fill],
      ['100%', palette.stroke]
    ];
    stops.forEach(([offset, stopColor, opacity]) => {
      const stop = document.createElementNS(svgNs, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', stopColor);
      if (opacity) stop.setAttribute('stop-opacity', opacity);
      grad.appendChild(stop);
    });

    defs.appendChild(grad);
  });

  svg.appendChild(defs);
  document.body.appendChild(svg);
}

export const PieceRenderer = React.memo<PieceRendererProps>(({
  shape,
  color,
  size = 14,
  className = ''
}) => {
  useLayoutEffect(() => {
    ensureSharedPieceGradientDefs();
  }, []);

  const gradId = getSharedGradientId(color in COLOR_MAP ? color : 'BLUE');
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
                fill={`url(#${gradId})`}
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
