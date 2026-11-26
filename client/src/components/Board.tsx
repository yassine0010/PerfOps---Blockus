import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  BOARD_SIZE,
  PieceDefinition,
  PlacementMode,
  PlayerColor,
  STARTING_CORNERS,
  getPieceAbsoluteCoords,
  isValidPlacement
} from '../../../shared/index.ts';

export interface BoardHandle {
  handleExternalPointerDown: (clientX: number, clientY: number) => void;
  handleExternalPointerMove: (clientX: number, clientY: number) => void;
  handleExternalPointerUp: () => void;
}

interface BoardProps {
  board: (PlayerColor | null)[][];
  activePlayerColor: PlayerColor;
  myColor: PlayerColor;
  isMyTurn: boolean;
  selectedPiece: PieceDefinition | null;
  rotation: number;
  flip: boolean;
  isFirstMove: boolean;
  targetOrigin: [number, number] | null;
  onSelectPlacementOrigin: (origin: [number, number] | null, isValid: boolean) => void;
  onCommitMove: () => void;
  placementMode?: PlacementMode;
  showLoupe?: boolean;
}

const COLOR_FILLS: Record<PlayerColor, { base: string; dark: string; light: string }> = {
  BLUE: { base: '#3E82F7', dark: '#2563EB', light: '#93C5FD' },
  YELLOW: { base: '#F5A623', dark: '#D97706', light: '#FDE68A' },
  RED: { base: '#E64A4A', dark: '#DC2626', light: '#FCA5A5' },
  GREEN: { base: '#38A169', dark: '#059669', light: '#86EFAC' }
};

export const Board = React.forwardRef<BoardHandle, BoardProps>(({
  board,
  myColor,
  isMyTurn,
  selectedPiece,
  rotation,
  flip,
  isFirstMove,
  targetOrigin,
  onSelectPlacementOrigin,
  onCommitMove,
  placementMode = 'CIRCULAR_BUTTON',
  showLoupe = true
}, ref) => {
  const [hoverOrigin, setHoverOrigin] = useState<[number, number] | null>(null);
  const [isPointerTouching, setIsPointerTouching] = useState<boolean>(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const cachedRectRef = useRef<DOMRect | null>(null);
  const currentCellRef = useRef<[number, number] | null>(null);
  const isTouchingRef = useRef<boolean>(false);
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  // Active placement candidate origin: either hovered or selected
  const activeOrigin = hoverOrigin || targetOrigin;

  let ghostCoords: [number, number][] = [];
  let isGhostValid = false;

  if (selectedPiece && activeOrigin && isMyTurn) {
    ghostCoords = getPieceAbsoluteCoords(
      selectedPiece.shape,
      rotation,
      flip,
      activeOrigin[0],
      activeOrigin[1]
    );
    const validation = isValidPlacement(board, ghostCoords, myColor, isFirstMove);
    isGhostValid = validation.valid;
  }

  // Pre-calculate ghost map for fast O(1) lookup
  const ghostMap = new Map<string, boolean>();
  ghostCoords.forEach(([gx, gy]) => {
    if (gx >= 0 && gx < BOARD_SIZE && gy >= 0 && gy < BOARD_SIZE) {
      ghostMap.set(`${gx},${gy}`, true);
    }
  });

  // Calculate loupe position directly without forcing React layout reflows
  const applyLoupePosition = (relX: number, relY: number, boardWidth: number) => {
    if (!loupeRef.current) return;
    const loupeWidth = 132;
    const loupeHeight = 156;
    const top = relY > 140 ? relY - loupeHeight - 16 : relY + 36;
    const left = Math.max(4, Math.min(boardWidth - loupeWidth - 4, relX - loupeWidth / 2));
    loupeRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  };

  // Position loupe initially as soon as touch begins
  useEffect(() => {
    if (isPointerTouching && lastTouchPosRef.current && cachedRectRef.current) {
      applyLoupePosition(
        lastTouchPosRef.current.x,
        lastTouchPosRef.current.y,
        cachedRectRef.current.width
      );
    }
  }, [isPointerTouching]);

  const updatePointer = (clientX: number, clientY: number) => {
    if (!boardRef.current || !selectedPiece || !isMyTurn) return;

    // Use cached rect during drag to eliminate layout thrashing
    const rect = cachedRectRef.current || boardRef.current.getBoundingClientRect();
    const boardWidth = rect.width;
    const cellSize = boardWidth / BOARD_SIZE;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    lastTouchPosRef.current = { x: relX, y: relY };

    // 1. Direct hardware-accelerated loupe positioning (Zero React re-renders)
    applyLoupePosition(relX, relY, boardWidth);

    // 2. Determine grid cell
    const gx = Math.floor(relX / cellSize);
    const gy = Math.floor(relY / cellSize);

    if (gx >= 0 && gx < BOARD_SIZE && gy >= 0 && gy < BOARD_SIZE) {
      // ONLY trigger React re-render when the grid cell actually changes!
      if (!currentCellRef.current || currentCellRef.current[0] !== gx || currentCellRef.current[1] !== gy) {
        currentCellRef.current = [gx, gy];
        setHoverOrigin([gx, gy]);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedPiece || !isMyTurn) return;
    isTouchingRef.current = true;
    setIsPointerTouching(true);

    if (boardRef.current) {
      cachedRectRef.current = boardRef.current.getBoundingClientRect();
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    updatePointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTouchingRef.current) return;
    updatePointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isTouchingRef.current = false;
    setIsPointerTouching(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    // Propagate final ghost position to parent now that drag has ended
    if (currentCellRef.current && selectedPiece && isMyTurn) {
      const [gx, gy] = currentCellRef.current;
      const testCoords = getPieceAbsoluteCoords(selectedPiece.shape, rotation, flip, gx, gy);
      const valid = isValidPlacement(board, testCoords, myColor, isFirstMove).valid;
      onSelectPlacementOrigin([gx, gy], valid);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    isTouchingRef.current = false;
    setIsPointerTouching(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerLeave = () => {
    if (!isTouchingRef.current) {
      setHoverOrigin(null);
      currentCellRef.current = null;
    }
  };

  // Expose methods for dragging from outside the board (e.g. from PieceTray)
  useImperativeHandle(ref, () => ({
    handleExternalPointerDown: (clientX: number, clientY: number) => {
      if (!selectedPiece || !isMyTurn) return;
      isTouchingRef.current = true;
      setIsPointerTouching(true);
      if (boardRef.current) {
        cachedRectRef.current = boardRef.current.getBoundingClientRect();
      }
      updatePointer(clientX, clientY);
    },
    handleExternalPointerMove: (clientX: number, clientY: number) => {
      if (!isTouchingRef.current) {
        isTouchingRef.current = true;
        setIsPointerTouching(true);
        if (boardRef.current) {
          cachedRectRef.current = boardRef.current.getBoundingClientRect();
        }
      }
      updatePointer(clientX, clientY);
    },
    handleExternalPointerUp: () => {
      isTouchingRef.current = false;
      setIsPointerTouching(false);
      // Propagate final ghost position to parent now that drag has ended
      if (currentCellRef.current && selectedPiece && isMyTurn) {
        const [gx, gy] = currentCellRef.current;
        const testCoords = getPieceAbsoluteCoords(selectedPiece.shape, rotation, flip, gx, gy);
        const valid = isValidPlacement(board, testCoords, myColor, isFirstMove).valid;
        onSelectPlacementOrigin([gx, gy], valid);
      }
    }
  }));

  const handleCellClick = (x: number, y: number) => {
    if (!selectedPiece || !isMyTurn) return;
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;

    // Double Tap Confirmation Support:
    // MUST be a rapid double-tap (within 380ms) on the target or ghost piece to confirm!
    if (placementMode === 'DOUBLE_TAP') {
      const isSameTarget = targetOrigin && targetOrigin[0] === x && targetOrigin[1] === y;
      const isGhostCell = ghostMap.has(`${x},${y}`);

      if ((isSameTarget || isGhostCell) && isGhostValid && timeSinceLastTap < 380) {
        lastTapTimeRef.current = 0;
        onCommitMove();
        return;
      }
    }

    // Record tap time
    lastTapTimeRef.current = now;

    const testCoords = getPieceAbsoluteCoords(selectedPiece.shape, rotation, flip, x, y);
    const valid = isValidPlacement(board, testCoords, myColor, isFirstMove).valid;
    onSelectPlacementOrigin([x, y], valid);
  };

  // Magnifier Loupe calculation: 5x5 sub-grid centered on activeOrigin
  const loupeOriginX = activeOrigin ? activeOrigin[0] : 0;
  const loupeOriginY = activeOrigin ? activeOrigin[1] : 0;

  // Floating Circular Confirmation Button calculation
  const isCircularMode = placementMode === 'CIRCULAR_BUTTON';
  const showConfirmButton =
    isCircularMode &&
    isMyTurn &&
    selectedPiece !== null &&
    targetOrigin !== null &&
    isGhostValid &&
    !isPointerTouching;

  let btnCenterX = targetOrigin ? targetOrigin[0] : 0;
  let btnCenterY = targetOrigin ? targetOrigin[1] : 0;

  if (ghostCoords.length > 0) {
    let minX = 20, maxX = 0, minY = 20, maxY = 0;
    for (const [gx, gy] of ghostCoords) {
      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
    }
    btnCenterX = (minX + maxX) / 2;
    btnCenterY = (minY + maxY) / 2;
  }

  const btnPctX = Math.max(9, Math.min(91, ((btnCenterX + 0.5) / BOARD_SIZE) * 100));
  const btnPctY = Math.max(9, Math.min(91, ((btnCenterY + 0.5) / BOARD_SIZE) * 100));

  return (
    <div
      ref={boardRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!isTouchingRef.current) {
          isTouchingRef.current = true;
          setIsPointerTouching(true);
          if (boardRef.current) {
            cachedRectRef.current = boardRef.current.getBoundingClientRect();
          }
        }
        updatePointer(e.clientX, e.clientY);
      }}
      onDrop={(e) => {
        e.preventDefault();
        isTouchingRef.current = false;
        setIsPointerTouching(false);
        // Propagate final position after HTML5 drop
        if (currentCellRef.current && selectedPiece && isMyTurn) {
          const [gx, gy] = currentCellRef.current;
          const testCoords = getPieceAbsoluteCoords(selectedPiece.shape, rotation, flip, gx, gy);
          const valid = isValidPlacement(board, testCoords, myColor, isFirstMove).valid;
          onSelectPlacementOrigin([gx, gy], valid);
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        background: '#FFFFFF',
        borderRadius: 20,
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.05)',
        border: '1.5px solid #E8ECEF',
        padding: 5,
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        gap: 1.2,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* Interactive 20x20 Grid Cells */}
      {Array.from({ length: BOARD_SIZE }).map((_, y) =>
        Array.from({ length: BOARD_SIZE }).map((__, x) => {
          const cellColor = board[y][x];
          const isGhost = ghostMap.has(`${x},${y}`);
          const isAnchor = activeOrigin && activeOrigin[0] === x && activeOrigin[1] === y;

          const isCorner =
            (x === 0 && y === 0) ||
            (x === 19 && y === 0) ||
            (x === 0 && y === 19) ||
            (x === 19 && y === 19);

          let cornerColor: PlayerColor | null = null;
          if (x === 0 && y === 0) cornerColor = 'YELLOW';
          if (x === 19 && y === 0) cornerColor = 'RED';
          if (x === 0 && y === 19) cornerColor = 'BLUE';
          if (x === 19 && y === 19) cornerColor = 'GREEN';

          return (
            <div
              key={`${x}-${y}`}
              onClick={() => handleCellClick(x, y)}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                borderRadius: 3.5,
                background: cellColor
                  ? COLOR_FILLS[cellColor].base
                  : isGhost
                  ? isGhostValid
                    ? 'rgba(56, 161, 105, 0.45)'
                    : 'rgba(239, 68, 68, 0.35)'
                  : '#F6F8FA',
                border: cellColor
                  ? `1px solid ${COLOR_FILLS[cellColor].dark}`
                  : isGhost
                  ? isGhostValid
                    ? '1.5px dashed #22C55E'
                    : '1.5px dashed #EF4444'
                  : '1px solid rgba(226, 232, 240, 0.6)',
                boxShadow: cellColor
                  ? `inset 0 1.5px 0 ${COLOR_FILLS[cellColor].light}`
                  : 'none',
                cursor: selectedPiece && isMyTurn ? 'pointer' : 'default',
                transition: 'background 0.08s ease'
              }}
            >
              {!cellColor && isCorner && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: cornerColor ? COLOR_FILLS[cornerColor].base : '#CBD5E1',
                    opacity: 0.8
                  }}
                />
              )}

              {isGhost && isAnchor && isGhostValid && !showConfirmButton && (
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px dashed #16A34A',
                    animation: 'pulseGlow 1s infinite'
                  }}
                />
              )}
            </div>
          );
        })
      )}

      {/* Floating Circular Confirmation Button (pops up on valid move) */}
      {showConfirmButton && (
        <div
          style={{
            position: 'absolute',
            left: `${btnPctX}%`,
            top: `${btnPctY}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 70,
            pointerEvents: 'auto',
            animation: 'popIn 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCommitMove();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            title="Confirm Placement"
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #22C55E 0%, #15803D 100%)',
              border: '3px solid #FFFFFF',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(22, 163, 74, 0.5), 0 2px 6px rgba(0,0,0,0.2)',
              animation: 'confirmPulse 1.8s infinite',
              transition: 'transform 0.12s ease'
            }}
          >
            <Check size={25} strokeWidth={3.8} color="#FFFFFF" />
          </button>
        </div>
      )}

      {/* Magnifier Loupe: Hardware-accelerated translate3d for zero-lag silky smooth glide */}
      {showLoupe && isPointerTouching && activeOrigin && selectedPiece && isMyTurn && (
        <div
          ref={loupeRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 132,
            height: 156,
            background: '#FFFFFF',
            borderRadius: 16,
            border: isGhostValid ? '2.5px solid #22C55E' : '2px solid #CBD5E1',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0,0,0,0.08)',
            zIndex: 999,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 6px 8px 6px',
            willChange: 'transform',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none'
          }}
        >
          {/* Loupe Header info (strictly read-only status badge) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              paddingBottom: 4,
              borderBottom: '1px solid #F1F5F9',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none'
            }}
          >
            <span
              style={{
                fontSize: '0.64rem',
                fontWeight: 900,
                color: isGhostValid ? '#15803D' : '#DC2626',
                background: isGhostValid ? '#DCFCE7' : '#FEE2E2',
                padding: '2px 10px',
                borderRadius: 99,
                letterSpacing: '0.5px',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                boxShadow: isGhostValid ? '0 1px 3px rgba(34, 197, 94, 0.2)' : '0 1px 3px rgba(239, 68, 68, 0.2)'
              }}
            >
              {isGhostValid ? '✓ VALID MOVE' : '✕ BLOCKED'}
            </span>
          </div>

          {/* 5x5 Magnified Grid (Compact for high-clarity viewing without blocking board) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gridTemplateRows: 'repeat(5, 1fr)',
              gap: 2,
              width: '100%',
              aspectRatio: '1 / 1',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none'
            }}
          >
            {[-2, -1, 0, 1, 2].map(dy =>
              [-2, -1, 0, 1, 2].map(dx => {
                const subX = loupeOriginX + dx;
                const subY = loupeOriginY + dy;
                const isOutOfBounds = subX < 0 || subX >= BOARD_SIZE || subY < 0 || subY >= BOARD_SIZE;
                const cellColor = !isOutOfBounds ? board[subY][subX] : null;
                const isSubGhost = ghostMap.has(`${subX},${subY}`);
                const isCenter = dx === 0 && dy === 0;

                const isLoupeCorner =
                  !isOutOfBounds &&
                  ((subX === 0 && subY === 0) ||
                    (subX === 19 && subY === 0) ||
                    (subX === 0 && subY === 19) ||
                    (subX === 19 && subY === 19));

                let loupeCornerColor: PlayerColor | null = null;
                if (subX === 0 && subY === 0) loupeCornerColor = 'YELLOW';
                if (subX === 19 && subY === 0) loupeCornerColor = 'RED';
                if (subX === 0 && subY === 19) loupeCornerColor = 'BLUE';
                if (subX === 19 && subY === 19) loupeCornerColor = 'GREEN';

                return (
                  <div
                    key={`loupe-${dx}-${dy}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 3.5,
                      background: isOutOfBounds
                        ? '#CBD5E1'
                        : cellColor
                        ? COLOR_FILLS[cellColor].base
                        : isSubGhost
                        ? isGhostValid
                          ? 'rgba(34, 197, 94, 0.7)'
                          : 'rgba(239, 68, 68, 0.55)'
                        : '#F8FAFC',
                      border: isOutOfBounds
                        ? '1px dashed #94A3B8'
                        : isCenter
                        ? '1.8px solid #2563EB'
                        : cellColor
                        ? `1px solid ${COLOR_FILLS[cellColor].dark}`
                        : isSubGhost
                        ? isGhostValid
                          ? '1.5px solid #16A34A'
                          : '1.5px solid #DC2626'
                        : '1px solid rgba(226, 232, 240, 0.8)',
                      boxShadow: cellColor
                        ? `inset 0 1.5px 0 ${COLOR_FILLS[cellColor].light}`
                        : 'none',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      userSelect: 'none',
                      WebkitUserSelect: 'none'
                    }}
                  >
                    {!cellColor && isLoupeCorner && (
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: loupeCornerColor ? COLOR_FILLS[loupeCornerColor].base : '#94A3B8',
                          opacity: 0.9
                        }}
                      />
                    )}

                    {isCenter && (
                      <div
                        style={{
                          position: 'absolute',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          border: '1.5px solid #2563EB',
                          background: '#FFFFFF',
                          boxShadow: '0 0 3px rgba(37, 99, 235, 0.5)'
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});
