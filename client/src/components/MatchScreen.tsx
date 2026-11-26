import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Volume2, VolumeX, Flag, Check, WifiOff, Wifi, Settings, AlertTriangle } from 'lucide-react';
import {
  PIECES,
  PieceDefinition,
  PieceId,
  PlacementMode,
  PlayerColor,
  RoomState,
  STARTING_CORNERS,
  findFirstLegalMove,
  getPieceAbsoluteCoords,
  isValidPlacement
} from '../../../shared/index.ts';
import { Board, type BoardHandle } from './Board.tsx';
import { PieceTray } from './PieceTray.tsx';
import { SettingsModal } from './SettingsModal.tsx';
import { sounds } from '../utils/sound.ts';

interface MatchScreenProps {
  roomState: RoomState;
  myPlayerId: string;
  onPlacePiece: (pieceId: PieceId, rotation: number, flip: boolean, x: number, y: number) => void;
  onPassTurn: () => void;
  onLeaveMatch: () => void;
}

export const MatchScreen: React.FC<MatchScreenProps> = ({
  roomState,
  myPlayerId,
  onPlacePiece,
  onPassTurn,
  onLeaveMatch
}) => {
  const me = roomState.players.find(p => p.id === myPlayerId);
  const activeTurnColor: PlayerColor = roomState.currentTurn;
  const isMyTurn = roomState.activePlayerId
    ? roomState.activePlayerId === myPlayerId
    : me ? (me.assignedColors ? me.assignedColors.includes(activeTurnColor) : me.color === activeTurnColor) : false;

  const [viewingColor, setViewingColor] = useState<PlayerColor | null>(null);

  // Sync viewing color to active turn color when it's our turn
  useEffect(() => {
    if (isMyTurn) {
      setViewingColor(activeTurnColor);
    } else if (!viewingColor && me) {
      setViewingColor(me.color);
    }
  }, [activeTurnColor, isMyTurn, me]);

  const currentTrayColor: PlayerColor = (isMyTurn ? activeTurnColor : (viewingColor || me?.color || 'BLUE'));
  const currentTrayPieces = roomState.colorStates
    ? (roomState.colorStates[currentTrayColor]?.remainingPieces || [])
    : (me?.remainingPieces || []);

  const isFirstMove = currentTrayPieces.length === 21;

  const [selectedPieceId, setSelectedPieceId] = useState<PieceId | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [flip, setFlip] = useState<boolean>(false);
  const [targetOrigin, setTargetOrigin] = useState<[number, number] | null>(null);
  const [isTargetValid, setIsTargetValid] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('blokus_sound_enabled');
    const enabled = saved !== null ? saved === 'true' : true;
    sounds.enabled = enabled;
    return enabled;
  });
  const [placementMode, setPlacementMode] = useState<PlacementMode>(() => {
    return (localStorage.getItem('blokus_placement_mode') as PlacementMode) || 'CIRCULAR_BUTTON';
  });
  const [loupeEnabled, setLoupeEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('blokus_loupe_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(roomState.turnDurationSeconds);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);
  const boardComponentRef = useRef<BoardHandle>(null);

  // Check if current active player has at least one valid legal move remaining.
  // Deferred to avoid blocking the main thread during render.
  const [hasLegalMove, setHasLegalMove] = useState<boolean>(true);
  useEffect(() => {
    if (!isMyTurn || currentTrayPieces.length === 0) {
      setHasLegalMove(true);
      return;
    }
    const timeoutId = setTimeout(() => {
      const candidate = findFirstLegalMove(roomState.board, currentTrayPieces, currentTrayColor, isFirstMove);
      setHasLegalMove(candidate !== null);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [isMyTurn, roomState.board, currentTrayPieces, currentTrayColor, isFirstMove]);

  // Auto-select first available piece and snap to corner on first move
  useEffect(() => {
    if (currentTrayPieces.length > 0) {
      if (!selectedPieceId || !currentTrayPieces.includes(selectedPieceId)) {
        const nextPieceId = currentTrayPieces[0];
        setSelectedPieceId(nextPieceId);

        if (isFirstMove) {
          const corner = STARTING_CORNERS[currentTrayColor];
          setTargetOrigin(corner);
          const pieceDef = PIECES[nextPieceId];
          if (pieceDef) {
            const coords = getPieceAbsoluteCoords(pieceDef.shape, 0, false, corner[0], corner[1]);
            const valid = isValidPlacement(roomState.board, coords, currentTrayColor, true).valid;
            setIsTargetValid(valid);
          }
        } else {
          setTargetOrigin(null);
          setIsTargetValid(false);
        }
      }
    }
  }, [currentTrayColor, currentTrayPieces, isFirstMove, roomState.board]);

  // Turn timer countdown
  useEffect(() => {
    const elapsed = Math.floor((Date.now() - roomState.turnStartedAt) / 1000);
    const remaining = Math.max(0, roomState.turnDurationSeconds - elapsed);
    setTimeLeft(remaining);

    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [roomState.turnStartedAt, roomState.turnDurationSeconds]);

  const selectedPiece: PieceDefinition | null = selectedPieceId ? PIECES[selectedPieceId] : null;

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    revalidateTarget(nextRot, flip);
  };

  const handleFlip = () => {
    const nextFlip = !flip;
    setFlip(nextFlip);
    revalidateTarget(rotation, nextFlip);
  };

  const handleResetTransform = () => {
    setRotation(0);
    setFlip(false);
    revalidateTarget(0, false);
  };

  const handleNudge = (dx: number, dy: number) => {
    const current = targetOrigin || (isFirstMove ? STARTING_CORNERS[currentTrayColor] : [9, 9]);
    const newX = Math.max(0, Math.min(19, current[0] + dx));
    const newY = Math.max(0, Math.min(19, current[1] + dy));
    setTargetOrigin([newX, newY]);
    if (selectedPiece) {
      const coords = getPieceAbsoluteCoords(selectedPiece.shape, rotation, flip, newX, newY);
      const valid = isValidPlacement(roomState.board, coords, currentTrayColor, isFirstMove).valid;
      setIsTargetValid(valid);
    }
  };

  const revalidateTarget = (rot: number, flp: boolean) => {
    if (selectedPiece && targetOrigin) {
      const coords = getPieceAbsoluteCoords(selectedPiece.shape, rot, flp, targetOrigin[0], targetOrigin[1]);
      const valid = isValidPlacement(roomState.board, coords, currentTrayColor, isFirstMove).valid;
      setIsTargetValid(valid);
    }
  };

  const handleSelectPlacementOrigin = (origin: [number, number] | null, isValid: boolean) => {
    setTargetOrigin(origin);
    setIsTargetValid(isValid);
  };

  const handleCommitMove = () => {
    if (!selectedPieceId || !targetOrigin || !isTargetValid || !isMyTurn) return;
    onPlacePiece(selectedPieceId, rotation, flip, targetOrigin[0], targetOrigin[1]);
    setTargetOrigin(null);
    setIsTargetValid(false);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 10px', minHeight: '100vh' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
        <button
          onClick={() => setShowLeaveConfirm(true)}
          title="Leave Match"
          style={{
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            width: 38,
            height: 38,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <ChevronLeft size={20} color="#1E293B" />
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.05rem', letterSpacing: '0.5px' }}>
            MATCH IN PROGRESS
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              sounds.enabled = next;
              localStorage.setItem('blokus_sound_enabled', String(next));
            }}
            title={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {soundEnabled ? <Volume2 size={18} color="#475569" /> : <VolumeX size={18} color="#94A3B8" />}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            title="Game & Control Settings"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}
          >
            <Settings size={18} color="#475569" />
          </button>
        </div>
      </div>

      {/* Disconnected Players Alert Banner (if any player is offline) */}
      {roomState.players.some(p => !p.isConnected) && (
        <div
          className="slide-down-alert"
          style={{
            background: 'linear-gradient(90deg, #FEF2F2 0%, #FFF1F2 100%)',
            border: '1.5px solid #FECDD3',
            borderRadius: 14,
            padding: '8px 12px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(225, 29, 72, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#EF4444',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <WifiOff size={13} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9F1239', fontWeight: 800 }}>
              <span>
                {roomState.players.filter(p => !p.isConnected).map(p => p.name).join(', ')} disconnected · 3m reconnect grace
              </span>
            </div>
          </div>
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 900,
              background: '#FFE4E6',
              color: '#BE123C',
              padding: '2px 7px',
              borderRadius: 6,
              letterSpacing: '0.5px'
            }}
          >
            OFFLINE
          </span>
        </div>
      )}      {/* Opponent Out / Passed Alert Banner (Especially prominent in 1vs1) */}
      {roomState.players.some(p => p.id !== myPlayerId && p.hasPassed) && (
        <div
          className="slide-down-alert"
          style={{
            background: 'linear-gradient(90deg, #FEF9C3 0%, #FEF08A 100%)',
            border: '1.5px solid #FACC15',
            borderRadius: 14,
            padding: '8px 12px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 8px rgba(234, 179, 8, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#EAB308',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '0.72rem'
              }}
            >
              ✕
            </div>
            <div style={{ fontSize: '0.75rem', color: '#713F12', fontWeight: 800 }}>
              <span>
                {roomState.players.filter(p => p.id !== myPlayerId && p.hasPassed).map(p => p.name).join(', ')} is OUT (No legal moves left) · Keep playing!
              </span>
            </div>
          </div>
          <span
            style={{
              fontSize: '0.62rem',
              fontWeight: 900,
              background: '#CA8A04',
              color: '#FFFFFF',
              padding: '2px 7px',
              borderRadius: 6,
              letterSpacing: '0.5px'
            }}
          >
            OUT
          </span>
        </div>
      )}

      {/* Explicit No Legal Moves Alert for Active Player */}
      {isMyTurn && !hasLegalMove && (
        <div
          className="slide-down-alert"
          style={{
            background: 'linear-gradient(90deg, #FEF2F2 0%, #FFF1F2 100%)',
            border: '2px solid #EF4444',
            borderRadius: 16,
            padding: '10px 14px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.18)',
            animation: 'pulseGlow 2s infinite ease-in-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#EF4444',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: '#991B1B', fontWeight: 900, letterSpacing: '0.3px' }}>
                NO LEGAL MOVES REMAINING!
              </div>
              <div style={{ fontSize: '0.72rem', color: '#B91C1C', fontWeight: 600 }}>
                All spots for your remaining pieces are blocked. Click PASS below to advance.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onPassTurn}
            className="btn-coral"
            style={{
              padding: '8px 14px',
              fontSize: '0.82rem',
              background: '#EF4444',
              boxShadow: '0 2px 0 #991B1B, 0 4px 10px rgba(239, 68, 68, 0.4)',
              whiteSpace: 'nowrap'
            }}
          >
            PASS NOW
          </button>
        </div>
      )}

      {/* Turn Indicator & 4 Player Pills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px', gap: 6 }}>
        {/* Current Turn Time or Offline Warning */}
        {(() => {
          const currentTurnPlayer = roomState.players.find(p => p.color === roomState.currentTurn);
          const isCurrentTurnOffline = currentTurnPlayer ? !currentTurnPlayer.isConnected : false;

          if (isCurrentTurnOffline) {
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#FEF2F2',
                  border: '1.5px solid #FCA5A5',
                  borderRadius: 12,
                  padding: '6px 10px',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.12)'
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'pulseGlow 1.5s infinite'
                  }}
                >
                  <WifiOff size={13} strokeWidth={2.5} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#B91C1C', letterSpacing: '0.3px' }}>
                    {currentTurnPlayer?.name.split(' ')[0].toUpperCase()} (OFFLINE)
                  </span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#DC2626' }}>
                    Passes in {formatTimer(timeLeft)}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  className="pulse-dot"
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: `var(--color-${roomState.currentTurn.toLowerCase()})`,
                    boxShadow: `0 0 8px var(--color-${roomState.currentTurn.toLowerCase()}-glow)`
                  }}
                />
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: `var(--color-${roomState.currentTurn.toLowerCase()})`,
                    letterSpacing: '0.5px'
                  }}
                >
                  {isMyTurn ? `YOUR TURN (${roomState.currentTurn})` : `${roomState.currentTurn}'S TURN`}
                </span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
                {formatTimer(timeLeft)}
              </div>
            </div>
          );
        })()}

        {/* Players Status Pills with Multi-Color Badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {roomState.players.map(player => {
            const isMe = player.id === myPlayerId;
            const isPlayerActive = roomState.activePlayerId
              ? roomState.activePlayerId === player.id
              : player.assignedColors
              ? player.assignedColors.includes(roomState.currentTurn)
              : player.color === roomState.currentTurn;
            const isOffline = !player.isConnected;
            const isPassed = player.hasPassed;

            return (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 14,
                  background: isOffline
                    ? '#FEF2F2'
                    : isPassed
                    ? '#F8FAFC'
                    : isPlayerActive
                    ? '#F0F6FF'
                    : '#FFFFFF',
                  border: isOffline
                    ? '2px dashed #EF4444'
                    : isPassed
                    ? '1.5px dashed #94A3B8'
                    : isPlayerActive
                    ? '2px solid #2563EB'
                    : '1.5px solid #E2E8F0',
                  boxShadow: isPlayerActive && !isPassed
                    ? '0 2px 10px rgba(37, 99, 235, 0.2)'
                    : 'none',
                  opacity: isPassed ? 0.72 : 1,
                  animation: isOffline ? 'disconnectPulse 1.8s infinite ease-in-out' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Color dots for this player */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {(player.assignedColors || [player.color]).map(c => {
                    const isColorTurn = roomState.currentTurn === c;
                    const isColorPassed = roomState.colorStates ? roomState.colorStates[c]?.hasPassed : false;
                    const colorPts = roomState.colorStates ? roomState.colorStates[c]?.squaresRemaining : '';
                    return (
                      <div
                        key={c}
                        title={`${c}: ${colorPts} pt${isColorPassed ? ' (OUT)' : ''}`}
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: '50%',
                          background: isColorPassed ? '#94A3B8' : `var(--color-${c.toLowerCase()})`,
                          opacity: isColorPassed ? 0.35 : 1,
                          border: isColorTurn ? '2px solid #FFFFFF' : 'none',
                          boxShadow: isColorTurn ? '0 0 0 2px #2563EB, 0 0 6px rgba(37,99,235,0.5)' : 'none',
                          transform: isColorTurn ? 'scale(1.25)' : 'scale(1)',
                          transition: 'all 0.15s ease'
                        }}
                      />
                    );
                  })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.78rem', color: isOffline ? '#DC2626' : isPassed ? '#64748B' : '#1E293B' }}>
                      {isMe ? 'YOU' : player.name.split(' ')[0]}
                    </span>
                    {isPassed && (
                      <span
                        style={{
                          fontSize: '0.58rem',
                          fontWeight: 900,
                          background: '#E2E8F0',
                          color: '#475569',
                          padding: '1px 4px',
                          borderRadius: 4,
                          letterSpacing: '0.4px'
                        }}
                      >
                        OUT
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isPassed ? '#94A3B8' : '#64748B' }}>
                    {player.squaresRemaining} pt
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 20x20 Interactive Game Board */}
      <Board
        ref={boardComponentRef}
        board={roomState.board}
        activePlayerColor={roomState.currentTurn}
        myColor={currentTrayColor}
        isMyTurn={isMyTurn}
        selectedPiece={selectedPiece}
        rotation={rotation}
        flip={flip}
        isFirstMove={isFirstMove}
        targetOrigin={targetOrigin}
        onSelectPlacementOrigin={handleSelectPlacementOrigin}
        onCommitMove={handleCommitMove}
        placementMode={placementMode}
        showLoupe={loupeEnabled}
      />

      {/* Player Inventory Piece Tray with Drag to Grid & Precision Nudge */}
      {me && (
        <PieceTray
          remainingPieces={currentTrayPieces}
          selectedPieceId={selectedPieceId}
          rotation={rotation}
          flip={flip}
          color={currentTrayColor}
          onSelectPiece={(id) => {
            setSelectedPieceId(id);
            if (isFirstMove && !targetOrigin) {
              setTargetOrigin(STARTING_CORNERS[currentTrayColor]);
            }
          }}
          onRotate={handleRotate}
          onFlip={handleFlip}
          onResetTransform={handleResetTransform}
          onNudge={handleNudge}
          onDragPieceStart={(id, clientX, clientY) => {
            setSelectedPieceId(id);
            boardComponentRef.current?.handleExternalPointerDown(clientX, clientY);
          }}
          onDragPieceMove={(clientX, clientY) => {
            boardComponentRef.current?.handleExternalPointerMove(clientX, clientY);
          }}
          onDragPieceEnd={() => {
            boardComponentRef.current?.handleExternalPointerUp();
          }}
        />
      )}

      {/* Action Buttons: Pass & Place Piece */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 8, paddingBottom: 12 }}>
        <button
          onClick={onPassTurn}
          disabled={!isMyTurn}
          className={isMyTurn && !hasLegalMove ? 'btn-coral' : 'btn-secondary'}
          style={{
            fontSize: '0.95rem',
            background: isMyTurn && !hasLegalMove ? '#EF4444' : undefined,
            color: isMyTurn && !hasLegalMove ? '#FFFFFF' : undefined,
            boxShadow: isMyTurn && !hasLegalMove ? '0 0 0 3px rgba(239, 68, 68, 0.35), 0 4px 14px rgba(239, 68, 68, 0.5)' : undefined,
            animation: isMyTurn && !hasLegalMove ? 'pulseGlow 1.2s infinite' : undefined
          }}
        >
          <Flag size={16} />
          {isMyTurn && !hasLegalMove ? 'PASS (NO MOVES)' : 'PASS'}
        </button>

        <button
          onClick={handleCommitMove}
          disabled={!isMyTurn || !isTargetValid}
          className="btn-coral"
          style={{ fontSize: '0.95rem' }}
        >
          PLACE PIECE
          <Check size={18} strokeWidth={3} />
        </button>
      </div>

      {/* Leave Game Confirmation Modal */}
      {showLeaveConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10005,
            padding: 20
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 380,
              background: '#FFFFFF',
              borderRadius: 24,
              padding: '24px 20px',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              animation: 'bounceSubtle 0.18s ease-out'
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px auto'
              }}
            >
              <Flag size={26} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: 8, color: '#1E293B' }}>
              Leave & Forfeit Match?
            </h3>

            <p style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, lineHeight: 1.5, marginBottom: 22 }}>
              Leaving an ongoing match counts as an <strong>immediate forfeit</strong>. Your opponent will automatically win the game.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="btn-secondary"
                style={{ padding: '12px 14px', fontSize: '0.9rem' }}
              >
                Stay in Game
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onLeaveMatch();
                }}
                className="btn-coral"
                style={{
                  padding: '12px 14px',
                  background: '#EF4444',
                  boxShadow: '0 4px 0 #B91C1C, 0 6px 16px rgba(239, 68, 68, 0.35)',
                  fontSize: '0.9rem'
                }}
              >
                Forfeit & Leave
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Game Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        placementMode={placementMode}
        onChangePlacementMode={(mode) => {
          setPlacementMode(mode);
          localStorage.setItem('blokus_placement_mode', mode);
        }}
        loupeEnabled={loupeEnabled}
        onToggleLoupe={(enabled) => {
          setLoupeEnabled(enabled);
          localStorage.setItem('blokus_loupe_enabled', String(enabled));
        }}
        soundEnabled={soundEnabled}
        onToggleSound={(enabled) => {
          setSoundEnabled(enabled);
          sounds.enabled = enabled;
          localStorage.setItem('blokus_sound_enabled', String(enabled));
        }}
      />
    </div>
  );
};
