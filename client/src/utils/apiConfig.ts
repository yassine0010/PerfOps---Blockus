/**
 * Unified network endpoint configuration for Blokus Online.
 * Uses same-origin by default behind Nginx (80/443/default) and Vite dev proxy (3000),
 * supports explicit VITE_API_BASE overrides, and falls back to :3001 on unproxied static ports.
 */

const SAME_ORIGIN_PORTS = new Set(['', '80', '443', '3000']);

function getConfiguredBase(): string | null {
  const raw =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE
      : undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

export function getApiBase(): string {
  const configured = getConfiguredBase();
  if (configured) {
    return configured;
  }
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }
  if (SAME_ORIGIN_PORTS.has(window.location.port)) {
    return '';
  }
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

export function getWsUrl(): string {
  const configured = getConfiguredBase();
  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return `${configured.replace(/^http/i, 'ws')}/ws`;
    }
    if (/^wss?:\/\//i.test(configured)) {
      return `${configured}/ws`;
    }
  }
  if (typeof window === 'undefined') {
    return 'ws://localhost:3001/ws';
  }
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (SAME_ORIGIN_PORTS.has(window.location.port)) {
    return `${wsProto}//${window.location.host}/ws`;
  }
  return `${wsProto}//${window.location.hostname}:3001/ws`;
}
