import React, { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  handleExternalPointerDown: (clientX: number, clientY: number, piece?: PieceDefinition) => void;
  handleExternalPointerMove: (clientX: number, clientY: number) => void;
  handleExternalPointerUp: (clientX?: number, clientY?: number) => void;
  handleExternalPointerCancel: () => void;
}

interface BoardProps {
  board: (PlayerColor | null)[][];
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

interface CachedBoardMetrics {
  rect: DOMRect;
  contentLeft: number;
  contentTop: number;
  cellPitchX: number;
  cellPitchY: number;
  gapX: number;
  gapY: number;
}

const COLOR_FILLS: Record<PlayerColor, { base: string; dark: string; light: string }> = {
  BLUE: { base: '#3E82F7', dark: '#2563EB', light: '#93C5FD' },
  YELLOW: { base: '#F5A623', dark: '#D97706', light: '#FDE68A' },
  RED: { base: '#E64A4A', dark: '#DC2626', light: '#FCA5A5' },
  GREEN: { base: '#38A169', dark: '#059669', light: '#86EFAC' }
};

const CORNER_COLORS_MAP = new Map<number, PlayerColor>(
  (Object.entries(STARTING_CORNERS) as [PlayerColor, [number, number]][]).map(
    ([color, [cx, cy]]) => [cy * BOARD_SIZE + cx, color]
  )
);

const hasCoord = (coords: [number, number][], x: number, y: number): boolean => {
  for (let i = 0; i < coords.length; i++) {
    if (coords[i][0] === x && coords[i][1] === y) return true;
  }
  return false;
};

const PlacedGrid = React.memo<{ board: (PlayerColor | null)[][] }>(({ board }) => (
  <>
    {board.map((row, y) =>
      row.map((cellColor, x) => {
        const cornerColor = !cellColor ? CORNER_COLORS_MAP.get(y * BOARD_SIZE + x) : undefined;
        return (
          <div
            key={y * BOARD_SIZE + x}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: 3.5,
              background: cellColor ? COLOR_FILLS[cellColor].base : '#F6F8FA',
              border: cellColor
                ? `1px solid ${COLOR_FILLS[cellColor].dark}`
                : '1px solid rgba(226, 232, 240, 0.6)',
              boxShadow: cellColor
                ? `inset 0 1.5px 0 ${COLOR_FILLS[cellColor].light}`
                : 'none'
            }}
          >
            {cornerColor && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: COLOR_FILLS[cornerColor].base,
                  opacity: 0.8
                }}
              />
            )}
          </div>
        );
      })
    )}
  </>
));

export const Board = React.memo(React.forwardRef<BoardHandle, BoardProps>(({
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
  const cachedMetricsRef = useRef<CachedBoardMetrics | null>(null);
  const currentCellRef = useRef<[number, number] | null>(null);
  const isTouchingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const selectedPieceRef = useRef<PieceDefinition | null>(selectedPiece);
  selectedPieceRef.current = selectedPiece;
  const isMyTurnRef = useRef<boolean>(isMyTurn);
  isMyTurnRef.current = isMyTurn;

  // Active placement candidate origin: either hovered or selected
  const activeOrigin = hoverOrigin || targetOrigin;

  const { ghostCoords, isGhostValid } = useMemo(() => {
    if (!selectedPiece || !activeOrigin || !isMyTurn) {
      return { ghostCoords: [] as [number, number][], isGhostValid: false };
    }
    const coords = getPieceAbsoluteCoords(
      selectedPiece.shape,
      rotation,
      flip,
      activeOrigin[0],
      activeOrigin[1]
    );
    const validation = isValidPlacement(board, coords, myColor, isFirstMove);
    return { ghostCoords: coords, isGhostValid: validation.valid };
  }, [selectedPiece, activeOrigin, isMyTurn, rotation, flip, board, myColor, isFirstMove]);

  const { targetGhostCoords, isTargetGhostValid } = useMemo(() => {
    if (!selectedPiece || !targetOrigin || !isMyTurn) {
      return { targetGhostCoords: [] as [number, number][], isTargetGhostValid: false };
    }
    if (activeOrigin && activeOrigin[0] === targetOrigin[0] && activeOrigin[1] === targetOrigin[1]) {
      return { targetGhostCoords: ghostCoords, isTargetGhostValid: isGhostValid };
    }
    const coords = getPieceAbsoluteCoords(
      selectedPiece.shape,
      rotation,
      flip,
      targetOrigin[0],
      targetOrigin[1]
    );
    const validation = isValidPlacement(board, coords, myColor, isFirstMove);
    return { targetGhostCoords: coords, isTargetGhostValid: validation.valid };
  }, [selectedPiece, targetOrigin, isMyTurn, activeOrigin, ghostCoords, isGhostValid, rotation, flip, board, myColor, isFirstMove]);

  // Calculate loupe position directly without forcing React layout reflows
  const applyLoupePosition = (relX: number, relY: number, boardWidth: number) => {
    if (!loupeRef.current) return;
    const loupeWidth = 132;
    const loupeHeight = 156;
    const top = relY > 140 ? relY - loupeHeight - 16 : relY + 36;
    const left = Math.max(4, Math.min(boardWidth - loupeWidth - 4, relX - loupeWidth / 2));
    loupeRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  };

  // Position loupe synchronously before paint as soon as touch begins or activeOrigin mounts
  useLayoutEffect(() => {
    if (isPointerTouching && activeOrigin && lastTouchPosRef.current && cachedMetricsRef.current) {
      applyLoupePosition(
        lastTouchPosRef.current.x,
        lastTouchPosRef.current.y,
        cachedMetricsRef.current.rect.width
      );
    }
  }, [isPointerTouching, Boolean(activeOrigin), activeOrigin?.[0], activeOrigin?.[1]]);

  const clearPointerState = () => {
    isTouchingRef.current = false;
    setIsPointerTouching(false);
    pointerStartRef.current = null;
    currentCellRef.current = null;
    setHoverOrigin(null);
  };

  useEffect(() => {
    if (!isMyTurn || !selectedPiece) {
      clearPointerState();
    }
  }, [isMyTurn, selectedPiece]);

  const refreshMetrics = (): CachedBoardMetrics | null => {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const cs = window.getComputedStyle(boardRef.current);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padRight = parseFloat(cs.paddingRight) || 0;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
    const borderRight = parseFloat(cs.borderRightWidth) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
    const gapX = parseFloat(cs.columnGap || cs.gap) || 0;
    const gapY = parseFloat(cs.rowGap || cs.gap) || 0;

    const innerWidth = Math.max(1, rect.width - borderLeft - borderRight - padLeft - padRight);
    const innerHeight = Math.max(1, rect.height - borderTop - borderBottom - padTop - padBottom);

    const metrics: CachedBoardMetrics = {
      rect,
      contentLeft: rect.left + borderLeft + padLeft,
      contentTop: rect.top + borderTop + padTop,
      cellPitchX: (innerWidth + gapX) / BOARD_SIZE,
      cellPitchY: (innerHeight + gapY) / BOARD_SIZE,
      gapX,
      gapY
    };
    cachedMetricsRef.current = metrics;
    return metrics;
  };

  const getCellFromCoords = (clientX: number, clientY: number, m: CachedBoardMetrics): [number, number] | null => {
    const gx = Math.floor((clientX - m.contentLeft + m.gapX * 0.5) / m.cellPitchX);
    const gy = Math.floor((clientY - m.contentTop + m.gapY * 0.5) / m.cellPitchY);
    if (gx >= 0 && gx < BOARD_SIZE && gy >= 0 && gy < BOARD_SIZE) {
      return [gx, gy];
    }
    return null;
  };

  const updatePointer = (clientX: number, clientY: number) => {
    if (!boardRef.current || !selectedPieceRef.current || !isMyTurnRef.current) return;

    const m = cachedMetricsRef.current || refreshMetrics();
    if (!m) return;

    const relX = clientX - m.rect.left;
    const relY = clientY - m.rect.top;
    lastTouchPosRef.current = { x: relX, y: relY };

    // 1. Direct hardware-accelerated loupe positioning (Zero React re-renders)
    applyLoupePosition(relX, relY, m.rect.width);

    // 2. Determine grid cell accurately accounting for border, padding, and grid gaps
    const cell = getCellFromCoords(clientX, clientY, m);
    if (cell) {
      const [gx, gy] = cell;
      // ONLY trigger React re-render when the grid cell actually changes!
      if (!currentCellRef.current || currentCellRef.current[0] !== gx || currentCellRef.current[1] !== gy) {
        currentCellRef.current = [gx, gy];
        setHoverOrigin([gx, gy]);
      }
    } else if (currentCellRef.current !== null) {
      currentCellRef.current = null;
      setHoverOrigin(null);
    }
  };

  const validateCell = (gx: number, gy: number, pieceOverride?: PieceDefinition | null): boolean => {
    const piece = pieceOverride ?? selectedPieceRef.current;
    if (!piece || !isMyTurnRef.current) return false;
    if (activeOrigin && activeOrigin[0] === gx && activeOrigin[1] === gy && piece === selectedPiece) {
      return isGhostValid;
    }
    const testCoords = getPieceAbsoluteCoords(piece.shape, rotation, flip, gx, gy);
    return isValidPlacement(board, testCoords, myColor, isFirstMove).valid;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedPiece || !isMyTurn) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const metrics = refreshMetrics();
    const downCell = metrics ? getCellFromCoords(e.clientX, e.clientY, metrics) : null;
    const tappedExistingGhost =
      placementMode === 'DOUBLE_TAP' &&
      Boolean(targetOrigin && downCell && hasCoord(targetGhostCoords, downCell[0], downCell[1]));

    isTouchingRef.current = true;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    if (!tappedExistingGhost) {
      setIsPointerTouching(true);
      updatePointer(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTouchingRef.current) return;
    if (!isPointerTouching) {
      const start = pointerStartRef.current;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) {
        return;
      }
      setIsPointerTouching(true);
    }
    updatePointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    const metrics = cachedMetricsRef.current || refreshMetrics();
    const cell = metrics ? getCellFromCoords(e.clientX, e.clientY, metrics) : currentCellRef.current;
    const isTap = Boolean(start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8);

    clearPointerState();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (cell && selectedPiece && isMyTurn) {
      const [gx, gy] = cell;
      const now = Date.now();

      if (
        isTap &&
        placementMode === 'DOUBLE_TAP' &&
        targetOrigin &&
        hasCoord(targetGhostCoords, gx, gy)
      ) {
        const timeSinceLastTap = now - lastTapTimeRef.current;
        if (isTargetGhostValid && timeSinceLastTap < 450) {
          lastTapTimeRef.current = 0;
          onCommitMove();
          return;
        }
        if (isTargetGhostValid) {
          lastTapTimeRef.current = now;
          return;
        }
      }

      const valid = validateCell(gx, gy);
      if (isTap) {
        lastTapTimeRef.current = now;
      }

      onSelectPlacementOrigin([gx, gy], valid);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    clearPointerState();
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
    handleExternalPointerDown: (clientX: number, clientY: number, piece?: PieceDefinition) => {
      const activePiece = piece ?? selectedPieceRef.current;
      if (!activePiece || !isMyTurnRef.current) return;
      selectedPieceRef.current = activePiece;
      isTouchingRef.current = true;
      setIsPointerTouching(true);
      refreshMetrics();
      updatePointer(clientX, clientY);
    },
    handleExternalPointerMove: (clientX: number, clientY: number) => {
      if (!selectedPieceRef.current || !isMyTurnRef.current) return;
      if (!isTouchingRef.current) {
        isTouchingRef.current = true;
        setIsPointerTouching(true);
        refreshMetrics();
      }
      updatePointer(clientX, clientY);
    },
    handleExternalPointerUp: (clientX?: number, clientY?: number) => {
      const metrics = cachedMetricsRef.current || refreshMetrics();
      const finalCell =
        clientX !== undefined && clientY !== undefined && metrics
          ? getCellFromCoords(clientX, clientY, metrics)
          : currentCellRef.current;
      const activePiece = selectedPieceRef.current;
      const myTurn = isMyTurnRef.current;
      clearPointerState();
      if (finalCell && activePiece && myTurn) {
        const [gx, gy] = finalCell;
        const valid = validateCell(gx, gy, activePiece);
        onSelectPlacementOrigin([gx, gy], valid);
      }
    },
    handleExternalPointerCancel: () => {
      clearPointerState();
    }
  }));

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
        cursor: selectedPiece && isMyTurn ? 'pointer' : 'default',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
    >
      {/* Static 20x20 Placed Board Grid (memoized; re-renders only when board changes) */}
      <PlacedGrid board={board} />

      {/* Independent 1-5 Cell Ghost Preview Overlay */}
      {ghostCoords.length > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 5,
            display: 'grid',
            gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
            gap: 1.2,
            pointerEvents: 'none',
            zIndex: 5
          }}
        >
          {ghostCoords.map(([gx, gy]) => {
            if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE) return null;
            const isAnchor = Boolean(activeOrigin && activeOrigin[0] === gx && activeOrigin[1] === gy);
            return (
              <div
                key={`ghost-${gx}-${gy}`}
                style={{
                  gridColumn: gx + 1,
                  gridRow: gy + 1,
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  borderRadius: 3.5,
                  background: isGhostValid
                    ? 'rgba(56, 161, 105, 0.45)'
                    : 'rgba(239, 68, 68, 0.35)',
                  border: isGhostValid
                    ? '1.5px dashed #22C55E'
                    : '1.5px dashed #EF4444'
                }}
              >
                {isAnchor && isGhostValid && !showConfirmButton && (
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
          })}
        </div>
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
      {showLoupe && isPointerTouching && hoverOrigin && selectedPiece && isMyTurn && (
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
                const isSubGhost = hasCoord(ghostCoords, subX, subY);
                const isCenter = dx === 0 && dy === 0;
                const loupeCornerColor = !isOutOfBounds ? CORNER_COLORS_MAP.get(subY * BOARD_SIZE + subX) : undefined;

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
                    {!cellColor && loupeCornerColor && (
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: COLOR_FILLS[loupeCornerColor].base,
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
}));
