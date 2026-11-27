import React, { useCallback, useState } from 'react';
import type { PieceId } from '../../shared/types.ts';
import { useGameSocket } from './hooks/useGameSocket';
import { useAuth } from './hooks/useAuth';
import { SplashScreen } from './components/SplashScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { MatchScreen } from './components/MatchScreen';
import { GameOverModal } from './components/GameOverModal';
import { BottomNav, TabId } from './components/BottomNav';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { AlertCircle, WifiOff, Wifi } from 'lucide-react';

export const App: React.FC = () => {
  const {
    connected,
    clockOffsetMs,
    roomState,
    playerId,
    lastError,
    connectionAlert,
    dismissConnectionAlert,
    createRoom,
    joinRoom,
    leaveRoom,
    addBot,
    removeBot,
    kickPlayer,
    startGame,
    returnToLobby,
    placePiece,
    passTurn,
    resetError
  } = useGameSocket();

  const auth = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('PLAY');
  const [isViewingRules, setIsViewingRules] = useState<boolean>(false);

  // Whether we're in a game room (lobby or match)
  const inRoom = !!roomState;
  const currentRoomId = roomState?.roomId;
  const me = roomState?.players.find(p => p.id === playerId);
  const isHost = Boolean(roomState && playerId && (roomState.hostId === playerId || me?.isHost));

  // If user hits exit from game or lobby
  const handleExitMatch = useCallback(() => {
    if (currentRoomId) {
      leaveRoom(currentRoomId);
    }
    // Refresh user stats when leaving a game
    if (auth.isAuthenticated) {
      setTimeout(() => auth.refreshUser(), 500);
    }
  }, [currentRoomId, leaveRoom, auth.isAuthenticated, auth.refreshUser]);

  const handlePlayAgain = useCallback(() => {
    if (currentRoomId && playerId) {
      startGame(currentRoomId);
    }
  }, [currentRoomId, playerId, startGame]);

  const handleReturnToLobby = useCallback(() => {
    if (currentRoomId && isHost) {
      returnToLobby(currentRoomId);
    }
  }, [currentRoomId, isHost, returnToLobby]);

  // Pass auth token through to room creation/joining
  const handleHostParty = useCallback((name: string) => {
    createRoom(name, undefined, auth.token || undefined);
  }, [createRoom, auth.token]);

  const handleJoinParty = useCallback((roomId: string, name: string) => {
    joinRoom(roomId, name, undefined, auth.token || undefined);
  }, [joinRoom, auth.token]);

  const handleStartGame = useCallback(() => {
    if (currentRoomId) {
      startGame(currentRoomId);
    }
  }, [currentRoomId, startGame]);

  const handleAddBot = useCallback((botName?: string) => {
    if (currentRoomId) {
      addBot(currentRoomId, botName);
    }
  }, [currentRoomId, addBot]);

  const handleRemoveBot = useCallback((botId: string) => {
    if (currentRoomId) {
      removeBot(currentRoomId, botId);
    }
  }, [currentRoomId, removeBot]);

  const handleKickPlayer = useCallback((targetPlayerId: string) => {
    if (currentRoomId) {
      kickPlayer(currentRoomId, targetPlayerId);
    }
  }, [currentRoomId, kickPlayer]);

  const handlePlacePiece = useCallback((
    pieceId: PieceId,
    rot: number,
    flip: boolean,
    x: number,
    y: number
  ) => {
    if (currentRoomId) {
      placePiece(currentRoomId, pieceId, rot, flip, x, y);
    }
  }, [currentRoomId, placePiece]);

  const handlePassTurn = useCallback(() => {
    if (currentRoomId) {
      passTurn(currentRoomId);
    }
  }, [currentRoomId, passTurn]);

  const handleTabChange = useCallback((tab: TabId) => {
    setIsViewingRules(false);
    setActiveTab(tab);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Local Client Connection Loss Banner (only when inside a room/match) */}
      {!connected && inRoom && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100000,
            background: '#EF4444',
            color: '#FFFFFF',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: '0.8rem',
            fontWeight: 800,
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)'
          }}
        >
          <WifiOff size={15} />
          <span>Connection lost. Reconnecting to game server...</span>
        </div>
      )}

      {/* Non-overlapping Top-Center Toast Stack */}
      {(connectionAlert || lastError) && (
        <div
          style={{
            position: 'fixed',
            top: !connected && inRoom ? 42 : 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'none',
            maxWidth: '92vw'
          }}
        >
          {connectionAlert && (
            <div
              onClick={dismissConnectionAlert}
              className="slide-down-toast"
              style={{
                pointerEvents: 'auto',
                background: connectionAlert.type === 'DISCONNECTED' ? '#EF4444' : '#16A34A',
                color: '#FFFFFF',
                padding: '10px 18px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: connectionAlert.type === 'DISCONNECTED'
                  ? '0 8px 24px rgba(239, 68, 68, 0.4)'
                  : '0 8px 24px rgba(22, 163, 74, 0.4)',
                fontSize: '0.86rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {connectionAlert.type === 'DISCONNECTED' ? (
                <>
                  <WifiOff size={18} />
                  <span><strong>{connectionAlert.playerName}</strong> disconnected!</span>
                  {connectionAlert.reconnectDeadline && (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: 99 }}>
                      3m grace
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Wifi size={18} />
                  <span><strong>{connectionAlert.playerName}</strong> reconnected!</span>
                </>
              )}
            </div>
          )}

          {lastError && (
            <div
              onClick={resetError}
              className="slide-down-toast"
              style={{
                pointerEvents: 'auto',
                background: '#EF4444',
                color: '#FFFFFF',
                padding: '10px 18px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 6px 20px rgba(239, 68, 68, 0.35)',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <AlertCircle size={16} />
              <span>{lastError}</span>
            </div>
          )}
        </div>
      )}

      {/* Screen Router */}
      {inRoom ? (
        // ── In-room screens (no bottom nav) ──
        roomState.status === 'WAITING' ? (
          <LobbyScreen
            roomState={roomState}
            myPlayerId={playerId || ''}
            onStartGame={handleStartGame}
            onAddBot={handleAddBot}
            onRemoveBot={handleRemoveBot}
            onKickPlayer={handleKickPlayer}
            onLeaveRoom={handleExitMatch}
          />
        ) : (
          <>
            <MatchScreen
              roomState={roomState}
              myPlayerId={playerId || ''}
              clockOffsetMs={clockOffsetMs}
              onPlacePiece={handlePlacePiece}
              onPassTurn={handlePassTurn}
              onLeaveMatch={handleExitMatch}
            />

            {roomState.status === 'FINISHED' && (
              <GameOverModal
                roomState={roomState}
                myPlayerId={playerId || ''}
                isHost={isHost}
                onPlayAgain={handlePlayAgain}
                onReturnToLobby={handleReturnToLobby}
                onExit={handleExitMatch}
              />
            )}
          </>
        )
      ) : (
        // ── Home screens with bottom nav ──
        <>
          {/* Tab Content */}
          <div style={{ flex: 1, paddingBottom: (inRoom || isViewingRules) ? 0 : 72 }}>
            {activeTab === 'PLAY' && (
              <SplashScreen
                onHostParty={handleHostParty}
                onJoinParty={handleJoinParty}
                connected={connected}
                lastError={lastError}
                onClearError={resetError}
                currentUser={auth.user}
                onRulesToggle={setIsViewingRules}
              />
            )}
            {activeTab === 'LEADERBOARD' && (
              <LeaderboardScreen
                myUserId={auth.user?.id}
              />
            )}
            {activeTab === 'PROFILE' && (
              <ProfileScreen
                user={auth.user}
                loading={auth.loading}
                onLogin={auth.login}
                onRegister={auth.register}
                onLogout={auth.logout}
              />
            )}
          </div>

          {/* Bottom Navigation */}
          {!isViewingRules && (
            <BottomNav
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          )}
        </>
      )}
    </div>
  );
};
