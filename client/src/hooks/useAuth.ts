import { useCallback, useEffect, useState } from 'react';
import { joinMetrics } from '../utils/joinMetrics';
import { getApiBase } from '../utils/apiConfig';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  createdAt: number;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    totalSquaresPlaced: number;
    bestScore: number | null;
    winStreak: number;
    currentStreak: number;
  };
}

async function parseJsonSafe(res: Response): Promise<Record<string, any> | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('blokus_auth_token'));
  const [loading, setLoading] = useState<boolean>(true);

  // Restore session on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`${getApiBase()}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem('blokus_auth_token');
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
          return;
        }
        if (!res.ok) {
          return;
        }
        const data = await parseJsonSafe(res);
        if (!cancelled && data?.user) {
          setUser(data.user);
        }
      })
      .catch(() => {
        // Server unreachable, keep token until retry
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const submitAuthRequest = useCallback(async (
    action: 'login' | 'register',
    endpoint: string,
    payload: Record<string, unknown>,
    fallbackError: string
  ): Promise<{ success: boolean; error?: string }> => {
    const finishAttempt = joinMetrics.startAction(action);
    try {
      const res = await fetch(`${getApiBase()}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status >= 500) {
        finishAttempt('failure');
        return { success: false, error: 'Server error. Please try again.' };
      }
      const data = await parseJsonSafe(res);
      if (!res.ok && res.status < 500) {
        // User typos, bad credentials, or validation errors are excluded from availability metrics
        finishAttempt('excluded');
        return {
          success: false,
          error: (typeof data?.error === 'string' && data.error) || fallbackError
        };
      }
      if (data?.success && data.token && data.user) {
        finishAttempt('success');
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('blokus_auth_token', data.token);
        return { success: true };
      }
      finishAttempt('excluded');
      return {
        success: false,
        error: (typeof data?.error === 'string' && data.error) || fallbackError
      };
    } catch {
      finishAttempt('failure');
      return { success: false, error: 'Could not reach the server' };
    }
  }, []);

  const login = useCallback((username: string, password: string) => {
    return submitAuthRequest('login', '/api/login', { username, password }, 'Login failed');
  }, [submitAuthRequest]);

  const register = useCallback((username: string, password: string, displayName?: string) => {
    return submitAuthRequest('register', '/api/register', { username, password, displayName }, 'Registration failed');
  }, [submitAuthRequest]);

  const logout = useCallback(() => {
    if (token) {
      fetch(`${getApiBase()}/api/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('blokus_auth_token');
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) {
        localStorage.removeItem('blokus_auth_token');
        setToken(null);
        setUser(null);
        return;
      }
      if (!res.ok) return;
      const data = await parseJsonSafe(res);
      if (data?.user) setUser(data.user);
    } catch {}
  }, [token]);

  return {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser
  };
}
