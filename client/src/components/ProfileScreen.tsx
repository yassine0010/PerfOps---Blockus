import React, { useEffect, useState } from 'react';
import {
  User,
  LogOut,
  Gamepad2,
  Trophy,
  Target,
  Flame,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Loader2,
  AlertCircle,
  Clock,
  Swords
} from 'lucide-react';
import type { AuthUser } from '../hooks/useAuth';
import { joinMetrics } from '../utils/joinMetrics';
import { getApiBase } from '../utils/apiConfig';

interface GameRecord {
  id: string;
  roomId: string;
  players: { userId: string; playerName: string; color: string; squaresRemaining: number; rank: number; forfeited: boolean }[];
  playedAt: number;
}

interface ProfileScreenProps {
  user: AuthUser | null;
  loading: boolean;
  onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (username: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  loading,
  onLogin,
  onRegister,
  onLogout
}) => {
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 12 }}>
        <Loader2 size={28} color="#E77252" style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 700 }}>Loading profile...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onLogin={onLogin} onRegister={onRegister} />;
  }

  return <ProfileView user={user} onLogout={onLogout} />;
};

// ─── Auth Form (Login / Register) ────────────────────────────

const AuthForm: React.FC<{
  onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (username: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
}> = ({ onLogin, onRegister }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setSubmitting(true);
    setError(null);

    const result = mode === 'LOGIN'
      ? await onLogin(username.trim(), password)
      : await onRegister(username.trim(), password, displayName.trim() || undefined);

    if (!result.success) {
      setError(result.error || 'Something went wrong');
    }
    setSubmitting(false);
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
          background: 'linear-gradient(135deg, #E77252 0%, #D76142 50%, #B84C30 100%)',
          padding: '40px 24px 36px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', top: -15, left: -15, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -25, right: -10, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px auto',
            backdropFilter: 'blur(10px)'
          }}
        >
          <User size={30} color="#FFFFFF" />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: '0.5px' }}>
          Your Profile
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600, margin: '6px 0 0 0' }}>
          Sign in to track your stats and climb the leaderboard
        </p>
      </div>

      {/* Form */}
      <div style={{ padding: '24px 20px' }}>
        {/* Mode Tabs */}
        <div
          style={{
            display: 'flex',
            background: '#F1F5F9',
            borderRadius: 14,
            padding: 4,
            marginBottom: 22,
            gap: 4
          }}
        >
          {(['LOGIN', 'REGISTER'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 11,
                border: 'none',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: mode === m ? '#FFFFFF' : 'transparent',
                color: mode === m ? '#1E293B' : '#64748B',
                boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {m === 'LOGIN' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#FEF2F2',
              border: '1px solid #FECDD3',
              borderRadius: 12,
              marginBottom: 16,
              color: '#9F1239',
              fontSize: '0.82rem',
              fontWeight: 700
            }}
          >
            <AlertCircle size={16} color="#EF4444" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. nolan_pro"
              maxLength={20}
              required
              autoFocus
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 14,
                border: '1.5px solid #CBD5E1',
                fontSize: '1rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={e => (e.target.style.borderColor = '#E77252')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 4 characters"
              minLength={4}
              required
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 14,
                border: '1.5px solid #CBD5E1',
                fontSize: '1rem',
                fontFamily: 'inherit',
                fontWeight: 600,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={e => (e.target.style.borderColor = '#E77252')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
            />
          </div>

          {mode === 'REGISTER' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: 6 }}>
                Display Name <span style={{ color: '#94A3B8', fontWeight: 600 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="How others see you"
                maxLength={15}
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  borderRadius: 14,
                  border: '1.5px solid #CBD5E1',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={e => (e.target.style.borderColor = '#E77252')}
                onBlur={e => (e.target.style.borderColor = '#CBD5E1')}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username.trim() || !password.trim()}
            className="btn-coral"
            style={{
              width: '100%',
              marginTop: 6,
              padding: '14px',
              fontSize: '1rem'
            }}
          >
            {submitting ? (
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            ) : null}
            {mode === 'LOGIN' ? 'Sign In' : 'Create Account'}
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Guest Note */}
        <div
          style={{
            marginTop: 22,
            padding: '12px 16px',
            background: '#F8FAFC',
            borderRadius: 14,
            border: '1px solid #E2E8F0'
          }}
        >
          <p style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
            💡 You can play as a <strong>guest</strong> without an account. Sign in to track your wins and appear on the leaderboard!
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Profile View (Authenticated) ───────────────────────────

const ProfileView: React.FC<{
  user: AuthUser;
  onLogout: () => void;
}> = ({ user, onLogout }) => {
  const [profileUser, setProfileUser] = useState<AuthUser>(user);
  const [recentGames, setRecentGames] = useState<GameRecord[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingGames(true);
    setProfileError(null);
    const finishAttempt = joinMetrics.startAction('profile');
    let settled = false;
    const completeAttempt = (outcome: 'success' | 'failure' | 'excluded') => {
      if (settled) return;
      settled = true;
      finishAttempt(outcome);
    };

    fetch(`${getApiBase()}/api/profile/${user.id}`, { signal: controller.signal })
      .then(r => {
        if (r.status >= 500) throw new Error('Server error');
        if (r.status === 404 || !r.ok) {
          completeAttempt('excluded');
          setProfileError('Could not load match history');
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
        if (data.user) setProfileUser(data.user);
        if (data.recentGames) setRecentGames(data.recentGames);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          completeAttempt('excluded');
          return;
        }
        completeAttempt('failure');
        setProfileError('Could not reach the server to load profile history');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGames(false);
      });

    return () => {
      controller.abort();
      completeAttempt('excluded');
    };
  }, [user.id, reloadTick]);

  const activeUser = profileUser || user;
  const safeDisplayName = activeUser.displayName?.trim() || activeUser.username || 'Player';
  const winRate = activeUser.stats.gamesPlayed > 0
    ? Math.round((activeUser.stats.gamesWon / activeUser.stats.gamesPlayed) * 100)
    : 0;
  const bestScoreDisplay = activeUser.stats.bestScore === null || activeUser.stats.bestScore === -1
    ? '—'
    : activeUser.stats.bestScore;

  const statCards: { icon: React.ReactNode; label: string; value: string | number; color: string; bg: string }[] = [
    { icon: <Gamepad2 size={18} />, label: 'Played', value: activeUser.stats.gamesPlayed, color: '#3B82F6', bg: '#EFF6FF' },
    { icon: <Trophy size={18} />, label: 'Wins', value: activeUser.stats.gamesWon, color: '#F59E0B', bg: '#FFFBEB' },
    { icon: <TrendingUp size={18} />, label: 'Win Rate', value: `${winRate}%`, color: '#22C55E', bg: '#F0FDF4' },
    { icon: <Target size={18} />, label: 'Best', value: bestScoreDisplay, color: '#8B5CF6', bg: '#F5F3FF' },
    { icon: <Flame size={18} />, label: 'Streak', value: activeUser.stats.winStreak, color: '#EF4444', bg: '#FEF2F2' },
    { icon: <BarChart3 size={18} />, label: 'Placed', value: activeUser.stats.totalSquaresPlaced, color: '#06B6D4', bg: '#ECFEFF' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        paddingBottom: 80
      }}
    >
      {/* Profile Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #E77252 0%, #D76142 60%, #B84C30 100%)',
          padding: '32px 24px 28px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: `hsl(${((safeDisplayName.charCodeAt(0) || 65) * 47) % 360}, 55%, 50%)`,
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '1.8rem',
            margin: '0 auto 12px auto',
            border: '3px solid rgba(255,255,255,0.3)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
          }}
        >
          {safeDisplayName.charAt(0).toUpperCase()}
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#FFFFFF', margin: 0 }}>
          {safeDisplayName}
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600, margin: '4px 0 0 0' }}>
          @{activeUser.username} · Joined {new Date(activeUser.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{ padding: '16px 16px 0 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 20
          }}
        >
          {statCards.map(card => (
            <div
              key={card.label}
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                padding: '14px 10px',
                textAlign: 'center',
                border: '1.5px solid #F1F5F9',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: card.bg,
                  color: card.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px auto'
                }}
              >
                {card.icon}
              </div>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#1E293B' }}>
                {card.value}
              </div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.3px' }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Games */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 2px' }}>
            <Clock size={16} color="#64748B" />
            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E293B' }}>Recent Games</span>
          </div>

          {loadingGames ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: '0.82rem', fontWeight: 600 }}>
              Loading history...
            </div>
          ) : profileError ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 16px',
                background: '#FEF2F2',
                borderRadius: 16,
                border: '1.5px solid #FECDD3'
              }}
            >
              <p style={{ fontSize: '0.82rem', color: '#B91C1C', fontWeight: 700, margin: '0 0 10px 0' }}>
                {profileError}
              </p>
              <button
                type="button"
                onClick={() => setReloadTick(t => t + 1)}
                className="btn-secondary"
                style={{ padding: '7px 18px', fontSize: '0.8rem' }}
              >
                Retry
              </button>
            </div>
          ) : recentGames.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '28px 16px',
                background: '#F8FAFC',
                borderRadius: 16,
                border: '1.5px dashed #E2E8F0'
              }}
            >
              <Swords size={28} color="#CBD5E1" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600, margin: 0 }}>
                No games played yet. Go play some Blokus!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentGames.map(game => {
                const myResult = game.players.find(p => p.userId === user.id);
                const isWin = myResult?.rank === 1 && !myResult?.forfeited;
                const timeAgo = getTimeAgo(game.playedAt);

                return (
                  <div
                    key={game.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: 14,
                      background: isWin ? '#F0FDF4' : '#FFFFFF',
                      border: isWin ? '1.5px solid #BBF7D0' : '1.5px solid #F1F5F9'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: isWin ? '#22C55E' : '#64748B',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          fontSize: '0.75rem'
                        }}
                      >
                        #{myResult?.rank || '?'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1E293B' }}>
                          {isWin ? 'Victory!' : `Rank #${myResult?.rank || '?'}`}
                          {myResult?.forfeited && ' (Forfeit)'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600 }}>
                          {game.players.length}P · {timeAgo}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#64748B' }}>
                      {myResult?.forfeited ? '—' : `${myResult?.squaresRemaining} pts left`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 14,
            border: '2px solid #FCA5A5',
            background: '#FEF2F2',
            color: '#DC2626',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontFamily: 'inherit',
            transition: 'all 0.15s ease'
          }}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
