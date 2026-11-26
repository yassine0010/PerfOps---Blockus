import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, Home } from 'lucide-react';
import { RoomState } from '../../../shared/index';

interface GameOverModalProps {
  roomState: RoomState;
  myPlayerId: string;
  onPlayAgain: () => void;
  onExit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  roomState,
  myPlayerId,
  onPlayAgain,
  onExit
}) => {
  const ranked = [...roomState.players]
    .sort((a, b) => {
      if (a.forfeited && !b.forfeited) return 1;
      if (!a.forfeited && b.forfeited) return -1;
      return a.squaresRemaining - b.squaresRemaining;
    })
    .map((player, idx) => ({
      ...player,
      rank: idx + 1,
      isMe: player.id === myPlayerId
    }));

  const winner = ranked.find(p => !p.forfeited) || ranked[0];
  const amIWinner = winner && winner.isMe;
  const didSomeoneForfeit = roomState.players.some(p => p.forfeited);

  useEffect(() => {
    // Launch celebratory confetti
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 20
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          borderRadius: 28,
          padding: '30px 24px',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: amIWinner ? '#FEF3C7' : '#F1F5F9',
            color: amIWinner ? '#D97706' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto'
          }}
        >
          <Trophy size={34} />
        </div>

        <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: 4 }}>
          {amIWinner ? 'VICTORY!' : 'GAME OVER'}
        </h2>
        <p style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600, marginBottom: 20 }}>
          {didSomeoneForfeit && winner
            ? `${winner.name} won by forfeit!`
            : winner
            ? `${winner.name} won the match!`
            : 'Match finished'}
        </p>

        {/* Leaderboard Rankings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {ranked.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 14,
                background: item.isMe ? '#F0F6FF' : '#FAF8F5',
                border: item.isMe ? '1.5px solid #BFDBFE' : '1px solid #E2E8F0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: item.rank === 1 ? '#F59E0B' : '#64748B',
                    color: '#FFFFFF',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {item.rank}
                </span>

                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: `var(--color-${item.color.toLowerCase()})`
                  }}
                />

                <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                  {item.name} {item.isMe && '(You)'}
                </span>
              </div>

              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#64748B' }}>
                {item.forfeited ? (
                  <span
                    style={{
                      background: '#FEE2E2',
                      color: '#DC2626',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 99
                    }}
                  >
                    Forfeited
                  </span>
                ) : (
                  `${item.squaresRemaining} pts remaining`
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onPlayAgain} className="btn-coral" style={{ width: '100%' }}>
            <RotateCcw size={18} />
            PLAY AGAIN
          </button>
          <button onClick={onExit} className="btn-secondary" style={{ width: '100%' }}>
            <Home size={18} />
            BACK TO LOBBY
          </button>
        </div>
      </div>
    </div>
  );
};
