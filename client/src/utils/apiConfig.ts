/**
 * Unified network endpoint configuration for Blokus Online.
 * Routes automatically through Vite dev reverse proxy (port 3000)
 * to avoid cross-origin CORS/firewall/port-blocking issues on mobile LAN connections.
 */

export function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location.port === '3000') {
    return ''; // Same-origin via Vite proxy
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  return `${protocol}//${host}:3001`;
}

export function getWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:3001/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (window.location.port === '3000') {
    return `${protocol}//${window.location.host}/ws`;
  }
  return `${protocol}//${window.location.hostname}:3001/ws`;
}
