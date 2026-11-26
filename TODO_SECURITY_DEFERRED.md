# 📋 Security Hardening — Deferred Tasks

> Items to implement later (before production deployment / during load testing phase).

---

## 1. HTTP Rate Limiting

**File to create:** `server/src/rateLimiter.ts`  
**Apply in:** `server/src/server.ts` as Express middleware

| Endpoint | Limit | Window | Why |
|---|---|---|---|
| `POST /api/register` | 5 req | 15 min per IP | Prevent mass account creation |
| `POST /api/login` | 10 req | 5 min per IP | Prevent brute-force credential stuffing |
| `GET /api/leaderboard` | 30 req | 1 min per IP | Prevent scraping / polling floods |
| `GET /api/profile/:id` | 30 req | 1 min per IP | Same |

### Implementation sketch:
```typescript
// server/src/rateLimiter.ts
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }
  entry.count++;
  return entry.count > max; // true = blocked
}

// Periodic cleanup of expired buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 60_000);
```

Usage:
```typescript
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (rateLimit(`login:${ip}`, 10, 5 * 60_000)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  // ... existing logic
});
```

---

## 2. Connection & Resource Limits

**File:** `server/src/server.ts`

| Protection | Implementation |
|---|---|
| Max WS connections per IP | Track `Map<string, number>` on `wss.on('connection')`. Reject if > 10 from same IP. |
| Max rooms per IP | Track in `RoomManager`. Reject `CREATE_ROOM` if IP already hosts > 5 active rooms. |
| Idle socket timeout | Add 10-minute idle disconnect if no game message received. |
| Total server connection cap | `if (wss.clients.size >= 5000) ws.close(1013, 'Server at capacity');` |

### Implementation sketch:
```typescript
const ipConnectionCount = new Map<string, number>();

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const count = (ipConnectionCount.get(ip) || 0) + 1;

  if (count > 10) {
    ws.close(1013, 'Too many connections from this IP');
    return;
  }

  ipConnectionCount.set(ip, count);
  ws.on('close', () => {
    const c = (ipConnectionCount.get(ip) || 1) - 1;
    if (c <= 0) ipConnectionCount.delete(ip);
    else ipConnectionCount.set(ip, c);
  });

  // ... rest of connection handler
});
```

---

## 3. Auth Hardening (production-grade)

| Item | Current | Improvement |
|---|---|---|
| Password hash | SHA-256 + static salt | `crypto.scryptSync(password, perUserSalt, 64)` |
| Token expiry | None — tokens live forever | Add `expires_at` column; reject expired tokens; periodic sweep |
| Token entropy | `tok_` + short random | `crypto.randomBytes(32).toString('hex')` |

---

## Status

- [ ] HTTP Rate Limiter
- [ ] Connection & Resource Limits  
- [ ] Auth Hardening (scrypt + token expiry)
