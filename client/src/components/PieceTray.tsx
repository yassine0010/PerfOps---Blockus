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
  isMyTurn: boolean;
  controlledColors?: PlayerColor[];
  onSelectViewingColor?: (color: PlayerColor) => void;
  onSelectPiece: (pieceId: PieceId) => void;
  onRotate: () => void;
  onFlip: () => void;
  onResetTransform: () => void;
  onNudge?: (dx: number, dy: number) => void;
  onDragPieceStart?: (pieceId: PieceId, clientX: number, clientY: number) => void;
  onDragPieceMove?: (clientX: number, clientY: number) => void;
  onDragPieceEnd?: (clientX: number, clientY: number) => void;
  onDragPieceCancel?: () => void;
}

export const PieceTray = React.memo<PieceTrayProps>(({
  remainingPieces,
  selectedPieceId,
  rotation,
  flip,
  color,
  isMyTurn,
  controlledColors,
  onSelectViewingColor,
  onSelectPiece,
  onRotate,
  onFlip,
  onResetTransform,
  onNudge,
  onDragPieceStart,
  onDragPieceMove,
  onDragPieceEnd,
  onDragPieceCancel
}) => {
  const handlePiecePointerDown = (pieceId: PieceId, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMoveWindow);
      window.removeEventListener('pointerup', onPointerUpWindow);
      window.removeEventListener('pointercancel', onPointerCancelWindow);
    };

    const onPointerMoveWindow = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!isDragging) {
        if (!isMyTurn) return;
        // On touch: require upward motion steeper than horizontal so carousel scroll still works
        const shouldStartDrag = moveEvent.pointerType === 'touch'
          ? (dy < -10 && Math.abs(dy) > Math.abs(dx))
          : (dy < -8 || Math.hypot(dx, dy) > 10);

        if (shouldStartDrag) {
          isDragging = true;
          onSelectPiece(pieceId);
          onDragPieceStart?.(pieceId, moveEvent.clientX, moveEvent.clientY);
        }
      }

      if (isDragging) {
        onDragPieceMove?.(moveEvent.clientX, moveEvent.clientY);
      }
    };

    const onPointerUpWindow = (upEvent: PointerEvent) => {
      cleanup();
      if (isDragging) {
        onDragPieceEnd?.(upEvent.clientX, upEvent.clientY);
      } else {
        if (selectedPieceId !== pieceId) {
          sounds.playRotate();
        }
        onSelectPiece(pieceId);
      }
    };

    const onPointerCancelWindow = () => {
      cleanup();
      if (isDragging) {
        onDragPieceCancel?.();
      }
    };

    window.addEventListener('pointermove', onPointerMoveWindow);
    window.addEventListener('pointerup', onPointerUpWindow);
    window.addEventListener('pointercancel', onPointerCancelWindow);
  };

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, fontSize: '0.92rem', letterSpacing: '0.5px' }}>YOUR PIECES</span>
          {controlledColors && controlledColors.length > 1 && onSelectViewingColor ? (
            <div style={{ display: 'flex', gap: 4 }}>
              {controlledColors.map(c => {
                const isActiveView = c === color;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSelectViewingColor(c)}
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 99,
                      cursor: 'pointer',
                      background: isActiveView ? `var(--color-${c.toLowerCase()}-bg)` : '#F8FAFC',
                      color: isActiveView ? `var(--color-${c.toLowerCase()})` : '#64748B',
                      border: isActiveView
                        ? `1.5px solid var(--color-${c.toLowerCase()})`
                        : '1px solid #E2E8F0'
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : (
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
          )}
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
              type="button"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onPointerDown={(e) => handlePiecePointerDown(pieceId, e)}
              onClick={(e) => {
                // Only handle keyboard activation (detail === 0); pointer taps are handled on pointerup
                if (e.detail === 0) {
                  sounds.playRotate();
                  onSelectPiece(pieceId);
                }
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
                cursor: isMyTurn ? 'grab' : 'pointer',
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
              type="button"
              className="nudge-btn"
              onClick={() => onNudge(-1, 0)}
              disabled={!isMyTurn || !selectedPieceId}
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
                cursor: isMyTurn && selectedPieceId ? 'pointer' : 'not-allowed',
                opacity: isMyTurn && selectedPieceId ? 1 : 0.45,
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
            >
              <ChevronLeft size={24} color="#1E293B" strokeWidth={2.5} />
            </button>

            <button
              type="button"
              className="nudge-btn"
              onClick={() => onNudge(0, -1)}
              disabled={!isMyTurn || !selectedPieceId}
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
                cursor: isMyTurn && selectedPieceId ? 'pointer' : 'not-allowed',
                opacity: isMyTurn && selectedPieceId ? 1 : 0.45,
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
            >
              <ChevronUp size={24} color="#1E293B" strokeWidth={2.5} />
            </button>

            <button
              type="button"
              className="nudge-btn"
              onClick={() => onNudge(0, 1)}
              disabled={!isMyTurn || !selectedPieceId}
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
                cursor: isMyTurn && selectedPieceId ? 'pointer' : 'not-allowed',
                opacity: isMyTurn && selectedPieceId ? 1 : 0.45,
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
            >
              <ChevronDown size={24} color="#1E293B" strokeWidth={2.5} />
            </button>

            <button
              type="button"
              className="nudge-btn"
              onClick={() => onNudge(1, 0)}
              disabled={!isMyTurn || !selectedPieceId}
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
                cursor: isMyTurn && selectedPieceId ? 'pointer' : 'not-allowed',
                opacity: isMyTurn && selectedPieceId ? 1 : 0.45,
                transition: 'transform 0.1s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}
            >
              <ChevronRight size={24} color="#1E293B" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
