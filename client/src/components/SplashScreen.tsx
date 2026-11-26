import React, { useState, useEffect } from 'react';
import { X, ArrowRight, HelpCircle, UserCheck } from 'lucide-react';
import { RulesScreen } from './RulesScreen';

interface SplashScreenProps {
  onHostParty: (name: string) => void;
  onJoinParty: (roomId: string, name: string) => void;
  connected?: boolean;
  currentUser?: { displayName: string; username: string } | null;
  onRulesToggle?: (open: boolean) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onHostParty,
  onJoinParty,
  currentUser,
  onRulesToggle
}) => {
  const [modalMode, setModalMode] = useState<'NONE' | 'HOST' | 'JOIN'>('NONE');
  const [playerName, setPlayerName] = useState<string>(currentUser?.displayName || 'Player');
  const [roomCode, setRoomCode] = useState<string>('');
  const [showRules, setShowRules] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser?.displayName) {
      setPlayerName(currentUser.displayName);
    }
  }, [currentUser]);

  if (showRules) {
    return (
      <RulesScreen
        onBack={() => {
          setShowRules(false);
          onRulesToggle?.(false);
        }}
        initialMode="CORE"
      />
    );
  }

  const handleHostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    onHostParty(playerName.trim());
    setTimeout(() => {
      setIsSubmitting(false);
      setModalMode('NONE');
    }, 1200);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim() || isSubmitting) return;
    setIsSubmitting(true);
    onJoinParty(roomCode.trim().toUpperCase(), playerName.trim());
    setTimeout(() => {
      setIsSubmitting(false);
      setModalMode('NONE');
    }, 1200);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1E1E1E',
        overflow: 'hidden'
      }}
    >
      {/* Top Banner: The exact Gemini Generated Image from first screen.jpeg */}
      <div
        style={{
          width: '100%',
          height: '52vh',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <img
          src="/splash_banner.jpg"
          alt="Blokus Board"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
      </div>

      {/* Bottom Sheet Card exactly matching first screen.jpeg */}
      <div
        style={{
          flex: 1,
          background: '#F1F1F1',
          borderTopLeftRadius: 44,
          borderTopRightRadius: 44,
          marginTop: -32,
          position: 'relative',
          zIndex: 10,
          padding: '48px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24
        }}
      >
        {/* Authenticated user banner */}
        {currentUser && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
              border: '1px solid #E2E8F0',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#334155'
            }}
          >
            <UserCheck size={16} color="#16A34A" />
            <span>Playing as <strong>{currentUser.displayName}</strong></span>
          </div>
        )}

        {/* JOIN GAME Button */}
        <button
          onClick={() => setModalMode('JOIN')}
          className="btn-coral"
          style={{
            width: '100%',
            maxWidth: 320
          }}
        >
          JOIN GAME
          <ArrowRight size={18} />
        </button>

        {/* HOST GAME Button */}
        <button
          onClick={() => setModalMode('HOST')}
          className="btn-coral"
          style={{
            width: '100%',
            maxWidth: 320
          }}
        >
          HOST GAME
          <ArrowRight size={18} />
        </button>

        {/* WHAT IS BLOKUS? Rules Screen Button */}
        <button
          onClick={() => {
            setShowRules(true);
            onRulesToggle?.(true);
          }}
          style={{
            width: '100%',
            maxWidth: 320,
            background: '#FFFFFF',
            color: 'var(--primary-coral)',
            border: '2.5px solid var(--primary-coral)',
            fontWeight: 800,
            fontSize: '1.05rem',
            letterSpacing: '0.5px',
            padding: '15px 24px',
            borderRadius: 9999,
            boxShadow: '0 4px 0 #D76142, 0 8px 18px rgba(231, 114, 82, 0.2)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontFamily: 'inherit',
            transition: 'all 0.15s ease'
          }}
          onMouseDown={e => {
            e.currentTarget.style.transform = 'translateY(3px)';
            e.currentTarget.style.boxShadow = '0 1px 0 #D76142';
          }}
          onMouseUp={e => {
            e.currentTarget.style.transform = 'translateY(0px)';
            e.currentTarget.style.boxShadow = '0 4px 0 #D76142, 0 8px 18px rgba(231, 114, 82, 0.2)';
          }}
        >
          <HelpCircle size={19} color="var(--primary-coral)" strokeWidth={2.6} />
          WHAT IS BLOKUS?
        </button>
      </div>

      {/* Modal Dialog for entering Name / Room Code */}
      {modalMode !== 'NONE' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 380,
              background: '#FFFFFF',
              borderRadius: 28,
              padding: 26,
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <button
              onClick={() => {
                setIsSubmitting(false);
                setModalMode('NONE');
              }}
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
                cursor: 'pointer'
              }}
            >
              <X size={18} color="#64748B" />
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 900, marginBottom: 18, color: '#1E232A' }}>
              {modalMode === 'HOST' ? 'Host Game' : 'Join Game'}
            </h3>

            <form onSubmit={modalMode === 'HOST' ? handleHostSubmit : handleJoinSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6, color: '#475569' }}>
                  Your Nickname
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="e.g. Nolan"
                  maxLength={15}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 14,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    outline: 'none'
                  }}
                />
              </div>

              {modalMode === 'JOIN' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6, color: '#475569' }}>
                    Game Code
                  </label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={e => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="e.g. B7K4P"
                    maxLength={6}
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 14,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      letterSpacing: '3px',
                      textTransform: 'uppercase',
                      fontFamily: 'monospace',
                      outline: 'none'
                    }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-coral"
                style={{
                  width: '100%',
                  opacity: isSubmitting ? 0.75 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer'
                }}
              >
                {isSubmitting ? (
                  modalMode === 'HOST' ? 'Creating Game...' : 'Entering Game...'
                ) : (
                  <>
                    {modalMode === 'HOST' ? 'Create Game' : 'Enter Game'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
