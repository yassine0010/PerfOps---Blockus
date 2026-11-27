import React, { useState } from 'react';
import {
  ChevronLeft,
  HelpCircle,
  Share2,
  Crown,
  CheckCircle2,
  Hourglass,
  UserPlus,
  ArrowRight,
  WifiOff,
  Bot,
  Trash2,
  X,
  Sparkles
} from 'lucide-react';
import { RoomState } from '../../../shared/types.ts';
import { RulesScreen } from './RulesScreen';

interface LobbyScreenProps {
  roomState: RoomState;
  myPlayerId: string;
  onStartGame: () => void;
  onAddBot?: (botName?: string) => void;
  onRemoveBot?: (botId: string) => void;
  onKickPlayer?: (playerId: string) => void;
  onLeaveRoom: () => void;
}

const PRESET_BOT_NAMES = [
  'Alpha Bot',
  'Robo Blokus',
  'Cyber Pawn',
  'Matrix AI',
  'Byte Master',
  'Quantum Bot'
];

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  roomState,
  myPlayerId,
  onStartGame,
  onAddBot,
  onRemoveBot,
  onKickPlayer,
  onLeaveRoom
}) => {
  const me = roomState.players.find(p => p.id === myPlayerId);
  const isHost = me ? (me.id === roomState.hostId || me.isHost) : false;
  const [copied, setCopied] = useState<boolean>(false);

  const [showAddBotModal, setShowAddBotModal] = useState<boolean>(false);
  const [botNameInput, setBotNameInput] = useState<string>('');
  const [showRules, setShowRules] = useState<boolean>(false);
  const [rulesMode, setRulesMode] = useState<'2P' | '3P' | '4P' | 'CORE'>('2P');

  const handleOpenRules = () => {
    const count = roomState.players.length;
    if (count === 2) setRulesMode('2P');
    else if (count === 3) setRulesMode('3P');
    else if (count === 4) setRulesMode('4P');
    else setRulesMode('2P');
    setShowRules(true);
  };

  if (showRules) {
    return <RulesScreen onBack={() => setShowRules(false)} initialMode={rulesMode} />;
  }

  const copyWithFallback = (text: string): boolean => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  };

  const handleShare = async () => {
    let didCopy = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(roomState.roomId);
        didCopy = true;
      } else {
        didCopy = copyWithFallback(roomState.roomId);
      }
    } catch {
      didCopy = copyWithFallback(roomState.roomId);
    }

    if (didCopy) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleOpenAddBot = () => {
    const defaultName = PRESET_BOT_NAMES[roomState.players.length % PRESET_BOT_NAMES.length] || 'AI Bot';
    setBotNameInput(defaultName);
    setShowAddBotModal(true);
  };

  const handleConfirmAddBot = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = botNameInput.trim() || undefined;
    onAddBot?.(finalName);
    setShowAddBotModal(false);
    setBotNameInput('');
  };

  const hasMinPlayers = roomState.players.length >= 2;
  const anyDisconnected = roomState.players.some(p => !p.isConnected);
  const canStart = isHost && hasMinPlayers && !anyDisconnected;

  let startButtonLabel = 'START GAME';
  if (anyDisconnected) {
    startButtonLabel = 'WAITING RECONNECT...';
  } else if (!hasMinPlayers) {
    startButtonLabel = 'NEED 2+ PLAYERS';
  } else if (roomState.players.length === 2) {
    startButtonLabel = 'START GAME (2P)';
  } else if (roomState.players.length === 3) {
    startButtonLabel = 'START GAME (3P)';
  } else {
    startButtonLabel = 'START GAME';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 20px', minHeight: '100vh', justifyContent: 'space-between', position: 'relative' }}>
      <div>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button
            onClick={onLeaveRoom}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} color="#1E293B" />
          </button>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '1px' }}>
            BLOKUS PARTY
          </h2>

          <button
            type="button"
            onClick={handleOpenRules}
            title="How to Play Blokus (Rules & Modes)"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--primary-coral)';
              e.currentTarget.style.background = '#FFF5F2';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            <HelpCircle size={20} color="#64748B" />
          </button>
        </div>

        {/* Private Room and Code Section - Stacked vertically */}
        <div style={{ textAlign: 'center', marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-coral)', letterSpacing: '0.8px', marginBottom: 8 }}>
            YOUR PRIVATE ROOM
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              maxWidth: 280,
              background: '#FFFFFF',
              padding: '12px 20px',
              borderRadius: 24,
              border: '1.5px solid #FEE5DD',
              boxShadow: '0 4px 14px rgba(231, 114, 82, 0.08)'
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94A3B8' }}>PARTY CODE</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '3px', color: '#1E293B', fontFamily: 'monospace' }}>
                {roomState.roomId}
              </div>
            </div>

            <button
              onClick={handleShare}
              title="Copy Party Code"
              style={{
                background: '#FFF1ED',
                border: 'none',
                width: 44,
                height: 44,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--primary-coral)',
                transition: 'all 0.15s ease'
              }}
            >
              <Share2 size={20} />
            </button>
          </div>

          {copied && (
            <div style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 700, marginTop: 6 }}>
              ✓ Code copied to clipboard!
            </div>
          )}
        </div>

        {/* Waiting For Friends Card */}
        <div className="card" style={{ padding: '20px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
              <span style={{ fontWeight: 800, fontSize: '0.98rem' }}>Players in Room</span>
            </div>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                background: '#F1F5F9',
                color: '#64748B',
                padding: '4px 10px',
                borderRadius: 99
              }}
            >
              {roomState.players.length} / 4
            </span>
          </div>

          {/* Disconnect Alert if any player in lobby is offline */}
          {roomState.players.some(p => !p.isConnected) && (
            <div
              className="slide-down-alert"
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECDD3',
                borderRadius: 12,
                padding: '8px 12px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#9F1239',
                fontSize: '0.78rem',
                fontWeight: 800
              }}
            >
              <WifiOff size={15} color="#E11D48" />
              <span>A player has disconnected. Waiting for reconnection...</span>
            </div>
          )}

          {/* Player Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {roomState.players.map(player => {
              const isCurrentMe = player.id === myPlayerId;
              const isOffline = !player.isConnected;
              const isBot = Boolean(player.isBot || player.id.startsWith('bot_'));

              return (
                <div
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 16,
                    background: isOffline
                      ? '#FEF2F2'
                      : isBot
                      ? '#FAF5FF'
                      : isCurrentMe
                      ? '#F0F6FF'
                      : '#FAF8F5',
                    border: isOffline
                      ? '1.5px dashed #EF4444'
                      : isBot
                      ? '1.5px solid #E9D5FF'
                      : isCurrentMe
                      ? '1.5px solid #BFDBFE'
                      : '1px solid #F1F5F9',
                    animation: isOffline ? 'disconnectPulse 1.8s infinite ease-in-out' : 'none',
                    opacity: isOffline ? 0.9 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        position: 'relative',
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: isOffline
                          ? '#94A3B8'
                          : `var(--color-${player.color.toLowerCase()})`,
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '0.95rem'
                      }}
                    >
                      {isBot ? <Bot size={20} color="#FFFFFF" /> : player.name.charAt(0).toUpperCase()}
                      {isOffline && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: '#EF4444',
                            border: '2px solid #FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <WifiOff size={9} color="#FFFFFF" strokeWidth={3} />
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: isOffline ? '#991B1B' : '#1E293B' }}>
                          {player.name}
                        </span>

                        {isBot && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              background: '#F3E8FF',
                              color: '#7E22CE',
                              border: '1px solid #D8B4FE',
                              padding: '1px 6px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}
                          >
                            <Bot size={10} /> BOT
                          </span>
                        )}

                        {isOffline && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 900,
                              background: '#EF4444',
                              color: '#FFFFFF',
                              padding: '1px 6px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}
                          >
                            <WifiOff size={9} strokeWidth={2.5} /> DISCONNECTED
                          </span>
                        )}

                        {(player.isHost || player.id === roomState.hostId) && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              background: '#FEF3C7',
                              color: '#D97706',
                              padding: '2px 6px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}
                          >
                            <Crown size={10} /> HOST
                          </span>
                        )}

                        {isCurrentMe && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              background: '#DBEAFE',
                              color: '#2563EB',
                              padding: '2px 6px',
                              borderRadius: 6
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: isOffline ? '#DC2626' : '#64748B', fontWeight: isOffline ? 700 : 600 }}>
                        {isOffline
                          ? 'Offline · Reconnecting...'
                          : isBot
                          ? `Bot · ${player.color.toLowerCase()} team`
                          : (player.isHost || player.id === roomState.hostId)
                          ? 'Party host'
                          : `${player.color.toLowerCase()} team`}
                      </div>
                    </div>
                  </div>

                  <div>
                    {isOffline ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          title="Player is disconnected"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: '#FEE2E2',
                            padding: '4px 8px',
                            borderRadius: 8
                          }}
                        >
                          <WifiOff size={16} color="#DC2626" strokeWidth={2.5} />
                        </div>
                        {isHost && !isCurrentMe && onKickPlayer && (
                          <button
                            type="button"
                            onClick={() => onKickPlayer(player.id)}
                            title={`Remove disconnected player ${player.name}`}
                            style={{
                              background: '#FEE2E2',
                              border: 'none',
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              color: '#DC2626',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ) : isBot && isHost ? (
                      <button
                        onClick={() => onRemoveBot?.(player.id)}
                        title={`Remove ${player.name}`}
                        style={{
                          background: '#FEE2E2',
                          border: 'none',
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: '#DC2626',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : player.isReady ? (
                      <CheckCircle2 size={24} color="#22C55E" />
                    ) : (
                      <Hourglass size={22} color="#F59E0B" />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Slots Card & Add Bot Control */}
            {roomState.players.length < 4 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#FAFAFA',
                  border: '1.5px dashed #E2E8F0',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: '0.85rem', fontWeight: 700 }}>
                  <UserPlus size={16} color="#94A3B8" />
                  <span>{4 - roomState.players.length} open slot{4 - roomState.players.length > 1 ? 's' : ''}</span>
                  {roomState.players.length === 2 && (
                    <span style={{ fontSize: '0.72rem', background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: 99, fontWeight: 800 }}>
                      OFFICIAL 2P (2 COLORS EACH)
                    </span>
                  )}
                  {roomState.players.length === 3 && (
                    <span style={{ fontSize: '0.72rem', background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: 99, fontWeight: 800 }}>
                      OFFICIAL 3P (SHARED GREEN)
                    </span>
                  )}
                </div>

                {isHost && (
                  <button
                    onClick={handleOpenAddBot}
                    style={{
                      background: '#F5F3FF',
                      border: '1.5px solid #DDD6FE',
                      color: '#7C3AED',
                      padding: '6px 14px',
                      borderRadius: 99,
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 6px rgba(124, 58, 237, 0.08)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Bot size={15} />
                    + Add Bot
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Bot Modal */}
      {showAddBotModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            padding: 20
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 380,
              padding: 24,
              borderRadius: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              position: 'relative',
              animation: 'bounceSubtle 0.2s ease-out'
            }}
          >
            <button
              onClick={() => setShowAddBotModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#F1F5F9',
                border: 'none',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748B'
              }}
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  background: '#F5F3FF',
                  border: '1.5px solid #DDD6FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7C3AED'
                }}
              >
                <Bot size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1E293B', margin: 0 }}>Add AI Bot</h3>
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0 }}>Name your bot player</p>
              </div>
            </div>

            <form onSubmit={handleConfirmAddBot}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: 6 }}>
                  BOT NAME
                </label>
                <input
                  type="text"
                  value={botNameInput}
                  onChange={(e) => setBotNameInput(e.target.value)}
                  placeholder="Enter bot name..."
                  maxLength={18}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Preset quick picks */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={12} /> SUGGESTED NAMES
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRESET_BOT_NAMES.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setBotNameInput(name)}
                      style={{
                        background: botNameInput === name ? '#7C3AED' : '#F8FAFC',
                        color: botNameInput === name ? '#FFFFFF' : '#475569',
                        border: botNameInput === name ? '1px solid #6D28D9' : '1px solid #E2E8F0',
                        borderRadius: 99,
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAddBotModal(false)}
                  className="btn-secondary"
                  style={{ padding: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-coral"
                  style={{
                    padding: '12px',
                    background: '#7C3AED',
                    boxShadow: '0 4px 0 #5B21B6, 0 8px 18px rgba(124, 58, 237, 0.3)'
                  }}
                >
                  <Bot size={16} /> Add Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, paddingBottom: 16 }}>
        <button onClick={handleShare} className="btn-secondary">
          <Share2 size={18} />
          INVITE
        </button>

        <button
          onClick={onStartGame}
          disabled={!canStart}
          className="btn-coral"
        >
          {!isHost ? 'WAITING FOR HOST...' : startButtonLabel}
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};
