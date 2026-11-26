import React from 'react';
import {
  RotateCw,
  FlipHorizontal2,
  RotateCcw,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { PIECES, PieceId, PlayerColor, transformShape } from '../../../shared/index.ts';
import { PieceRenderer } from './PieceRenderer.tsx';
import { sounds } from '../utils/sound.ts';

interface PieceTrayProps {
  remainingPieces: PieceId[];
  selectedPieceId: PieceId | null;
  rotation: number;
  flip: boolean;
  color: PlayerColor;
  onSelectPiece: (pieceId: PieceId) => void;
  onRotate: () => void;
  onFlip: () => void;
  onResetTransform: () => void;
  onNudge?: (dx: number, dy: number) => void;
  onDragPieceStart?: (pieceId: PieceId, clientX: number, clientY: number) => void;
  onDragPieceMove?: (clientX: number, clientY: number) => void;
  onDragPieceEnd?: (clientX: number, clientY: number) => void;
}

export const PieceTray = React.memo<PieceTrayProps>(({
  remainingPieces,
  selectedPieceId,
  rotation,
  flip,
  color,
  onSelectPiece,
  onRotate,
  onFlip,
  onResetTransform,
  onNudge,
  onDragPieceStart,
  onDragPieceMove,
  onDragPieceEnd
}) => {
  const handlePiecePointerDown = (pieceId: PieceId, e: React.PointerEvent) => {
    sounds.playRotate();
    onSelectPiece(pieceId);

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    const onPointerMoveWindow = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      // Upward drag threshold (-8px) or moving more than 14px total triggers board drag
      if (!isDragging && (dy < -8 || Math.hypot(dx, dy) > 14)) {
        isDragging = true;
        onDragPieceStart?.(pieceId, moveEvent.clientX, moveEvent.clientY);
      }

      if (isDragging) {
        onDragPieceMove?.(moveEvent.clientX, moveEvent.clientY);
      }
    };

    const onPointerUpWindow = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMoveWindow);
      window.removeEventListener('pointerup', onPointerUpWindow);
      window.removeEventListener('pointercancel', onPointerUpWindow);

      if (isDragging) {
        onDragPieceEnd?.(upEvent.clientX, upEvent.clientY);
      }
    };

    window.addEventListener('pointermove', onPointerMoveWindow);
    window.addEventListener('pointerup', onPointerUpWindow);
    window.addEventListener('pointercancel', onPointerUpWindow);
  };

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: '0.92rem', letterSpacing: '0.5px' }}>YOUR PIECES</span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 99,
              background: `var(--color-${color.toLowerCase()}-bg)`,
              color: `var(--color-${color.toLowerCase()})`,
              border: `1px solid var(--color-${color.toLowerCase()}-border)`
            }}
          >
            {color}
          </span>
        </div>
        <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
          {remainingPieces.length} remaining
        </span>
      </div>

      {/* Horizontal Carousel */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '2px 2px 8px 2px',
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {remainingPieces.map(pieceId => {
          const pieceDef = PIECES[pieceId];
          const isSelected = selectedPieceId === pieceId;
          const displayShape = isSelected
            ? transformShape(pieceDef.shape, rotation, flip)
            : pieceDef.shape;

          return (
            <button
              key={pieceId}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', pieceId);
                onSelectPiece(pieceId);
              }}
              onPointerDown={(e) => handlePiecePointerDown(pieceId, e)}
              onClick={() => {
                onSelectPiece(pieceId);
              }}
              style={{
                position: 'relative',
                flex: '0 0 auto',
                minWidth: 64,
                height: 64,
                background: '#FFFFFF',
                borderRadius: 14,
                border: isSelected ? '2.5px solid #2563EB' : '1.5px solid #EAECEF',
                boxShadow: isSelected
                  ? '0 4px 12px rgba(37, 99, 235, 0.2)'
                  : '0 2px 5px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                padding: 4,
                touchAction: 'pan-x',
                transition: 'all 0.15s ease'
              }}
            >
              {isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    background: '#2563EB',
                    color: '#FFFFFF',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                  }}
                >
                  <Check size={11} strokeWidth={3} />
                </div>
              )}
              <PieceRenderer shape={displayShape} color={color} size={10} />
            </button>
          );
        })}
      </div>

      {/* Transform & Precision Nudge Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <button
          onClick={() => {
            sounds.playRotate();
            onRotate();
          }}
          disabled={!selectedPieceId}
          className="btn-secondary"
          style={{ padding: '8px 10px', fontSize: '0.82rem', gap: 6 }}
        >
          <RotateCw size={15} />
          Rotate
        </button>

        <button
          onClick={() => {
            sounds.playRotate();
            onFlip();
          }}
          disabled={!selectedPieceId}
          className="btn-secondary"
          style={{ padding: '8px 10px', fontSize: '0.82rem', gap: 6 }}
        >
          <FlipHorizontal2 size={15} />
          Flip
        </button>

        <button
          onClick={() => {
            sounds.playRotate();
            onResetTransform();
          }}
          disabled={!selectedPieceId}
          className="btn-secondary"
          style={{ padding: '8px 10px', fontSize: '0.82rem', gap: 6 }}
        >
          <RotateCcw size={15} />
          Reset
        </button>
      </div>

      {/* Mobile Precision Nudge Bar: Large, thumb-friendly directional movement buttons */}
      {onNudge && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FFFFFF',
            borderRadius: 16,
            padding: '8px 12px',
            border: '1.5px solid #E2E8F0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748B' }}>
            NUDGE MOVE
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onNudge(-1, 0)}
              disabled={!selectedPieceId}
              title="Move Left"
              style={{
                width: 50,
                height: 44,
                borderRadius: 12,
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <ChevronLeft size={24} color="#1E293B" strokeWidth={2.5} />
            </button>

            <button
              onClick={() => onNudge(0, -1)}
              disabled={!selectedPieceId}
              title="Move Up"
              style={{
                width: 50,
                height: 44,
                borderRadius: 12,
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <ChevronUp size={24} color="#1E293B" strokeWidth={2.5} />
            </button>

            <button
              onClick={() => onNudge(0, 1)}
              disabled={!selectedPieceId}
              title="Move Down"
              style={{
                width: 50,
                height: 44,
                borderRadius: 12,
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <ChevronDown size={24} color="#1E293B" strokeWidth={2.5} />
            </button>

            <button
              onClick={() => onNudge(1, 0)}
              disabled={!selectedPieceId}
              title="Move Right"
              style={{
                width: 50,
                height: 44,
                borderRadius: 12,
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
              onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
              onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <ChevronRight size={24} color="#1E293B" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
