import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, TrendingUp, Loader2 } from 'lucide-react';
import { joinMetrics } from '../utils/joinMetrics';
import { getApiBase } from '../utils/apiConfig';

interface LeaderboardEntry {
  id: string;
  displayName: string;
  avatarSeed: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    totalSquaresPlaced: number;
    bestScore: number | null;
    winStreak: number;
    currentStreak: number;
  };
  winRate: number;
}

interface LeaderboardScreenProps {
  myUserId?: string;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ myUserId }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  const fetchLeaderboard = () => setReloadTick(t => t + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const finishAttempt = joinMetrics.startAction('leaderboard');
    let settled = false;
    const completeAttempt = (outcome: 'success' | 'failure' | 'excluded') => {
      if (settled) return;
      settled = true;
      finishAttempt(outcome);
    };

    fetch(`${getApiBase()}/api/leaderboard`, { signal: controller.signal })
      .then(r => {
        if (r.status >= 500) throw new Error('Server error');
        if (!r.ok) {
          completeAttempt('excluded');
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data || controller.signal.aborted) {
          if (controller.signal.aborted) completeAttempt('excluded');
          return;
        }
        completeAttempt('success');
        setEntries(data.players || []);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          completeAttempt('excluded');
          return;
        }
        completeAttempt('failure');
        setError('Could not load leaderboard');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      completeAttempt('excluded');
    };
  }, [reloadTick]);

  const getRankStyle = (rank: number): React.CSSProperties => {
    if (rank === 1) return { background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)', color: '#78350F' };
    if (rank === 2) return { background: 'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%)', color: '#334155' };
    if (rank === 3) return { background: 'linear-gradient(135deg, #FDBA74 0%, #EA580C 100%)', color: '#7C2D12' };
    return { background: '#F1F5F9', color: '#64748B' };
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown size={14} strokeWidth={2.5} />;
    if (rank === 2) return <Medal size={14} strokeWidth={2.5} />;
    if (rank === 3) return <Medal size={14} strokeWidth={2.5} />;
    return <span style={{ fontSize: '0.75rem', fontWeight: 900 }}>{rank}</span>;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        paddingBottom: 80
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E293B 0%, #334155 50%, #1E293B 100%)',
          padding: '32px 24px 28px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Subtle decorative circles */}
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.08)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -10, width: 80, height: 80, borderRadius: '50%', background: 'rgba(231, 114, 82, 0.06)' }} />

        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.3)'
          }}
        >
          <Trophy size={28} color="#78350F" />
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: '1px' }}>
          LEADERBOARD
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600, margin: '6px 0 0 0' }}>
          Top players ranked by wins
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 16px', flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, flexDirection: 'column', gap: 12 }}>
            <Loader2 size={28} color="#E77252" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 700 }}>Loading rankings...</span>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#EF4444', fontWeight: 700, fontSize: '0.9rem' }}>{error}</p>
            <button
              onClick={fetchLeaderboard}
              className="btn-coral"
              style={{ marginTop: 12, padding: '10px 24px', fontSize: '0.85rem' }}
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}
            >
              <Trophy size={30} color="#D97706" />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1E293B', marginBottom: 6 }}>
              No Rankings Yet
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600, lineHeight: 1.5 }}>
              Play and complete games while logged in to appear on the leaderboard.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((entry, idx) => {
              const rank = idx + 1;
              const isMe = myUserId === entry.id;

              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 16,
                    background: isMe ? '#FFF7ED' : '#FFFFFF',
                    border: isMe ? '2px solid #FB923C' : '1.5px solid #F1F5F9',
                    boxShadow: isMe
                      ? '0 4px 14px rgba(251, 146, 60, 0.15)'
                      : rank <= 3
                      ? '0 2px 10px rgba(0, 0, 0, 0.04)'
                      : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Rank Badge */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      flexShrink: 0,
                      ...getRankStyle(rank)
                    }}
                  >
                    {getRankIcon(rank)}
                  </div>

                  {/* Avatar */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: `hsl(${(((entry.displayName || 'P').charCodeAt(0) || 65) * 47) % 360}, 60%, 55%)`,
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '1rem',
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    {(entry.displayName || '?').charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.displayName || 'Player'}
                      </span>
                      {isMe && (
                        <span
                          style={{
                            fontSize: '0.6rem',
                            fontWeight: 900,
                            background: '#FB923C',
                            color: '#FFFFFF',
                            padding: '1px 6px',
                            borderRadius: 6
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                      {entry.stats.gamesPlayed} game{entry.stats.gamesPlayed !== 1 ? 's' : ''} played
                    </span>
                  </div>

                  {/* Stats */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <TrendingUp size={13} color="#22C55E" />
                      <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#1E293B' }}>
                        {entry.stats.gamesWon}W
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        color: entry.winRate >= 50 ? '#16A34A' : '#64748B',
                        background: entry.winRate >= 50 ? '#DCFCE7' : '#F1F5F9',
                        padding: '1px 6px',
                        borderRadius: 99
                      }}
                    >
                      {entry.winRate}% WR
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
