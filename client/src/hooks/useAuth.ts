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
    bestScore: number;
    winStreak: number;
    currentStreak: number;
  };
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
    fetch(`${getApiBase()}/api/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        } else {
          localStorage.removeItem('blokus_auth_token');
          setToken(null);
        }
      })
      .catch(() => {
        // Server unreachable, keep token but clear user until retry
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const finishAttempt = joinMetrics.startAction('login');
    try {
      const res = await fetch(`${getApiBase()}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.status >= 500) {
        finishAttempt('failure');
        return { success: false, error: 'Server error. Please try again.' };
      }
      const data = await res.json();
      if (data.success && data.token && data.user) {
        finishAttempt('success');
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('blokus_auth_token', data.token);
        return { success: true };
      }
      // User typos or bad credentials are excluded from app availability metrics
      finishAttempt('excluded');
      return { success: false, error: data.error || 'Login failed' };
    } catch {
      finishAttempt('failure');
      return { success: false, error: 'Could not reach the server' };
    }
  }, []);

  const register = useCallback(async (username: string, password: string, displayName?: string): Promise<{ success: boolean; error?: string }> => {
    const finishAttempt = joinMetrics.startAction('register');
    try {
      const res = await fetch(`${getApiBase()}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName })
      });
      if (res.status >= 500) {
        finishAttempt('failure');
        return { success: false, error: 'Server error. Please try again.' };
      }
      const data = await res.json();
      if (data.success && data.token && data.user) {
        finishAttempt('success');
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('blokus_auth_token', data.token);
        return { success: true };
      }
      // User validation errors (username taken, etc.) are excluded from availability metrics
      finishAttempt('excluded');
      return { success: false, error: data.error || 'Registration failed' };
    } catch {
      finishAttempt('failure');
      return { success: false, error: 'Could not reach the server' };
    }
  }, []);

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
      const data = await res.json();
      if (data.user) setUser(data.user);
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
