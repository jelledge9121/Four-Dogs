# Production Hardening Audit (Critical + Moderate Only)

Date: 2026-04-26

Scope reviewed: route behavior, host redemption security, RLS posture, event loading resilience, duplicate check-in protection, rewards ledger integrity, and dead-code cleanup.

## Critical Risks

### C1) Unauthenticated redemption creation path can target arbitrary customers
- **Area:** Rewards ledger integrity / API security
- **Why it matters:** `POST /api/rewards/redeem` can establish customer context from `customer_id` or `phone` in request body without requiring a valid customer session token. This enables unauthorized users to create pending redemptions for another customer (especially by phone), creating abuse and operational load; if approved by host, points are deducted from victim balances.
- **Evidence:** `buildSessionContext()` accepts `body.customer_id` and `body.phone` before token validation, and route proceeds with that context.
- **Hardening direction:** Require verified session token (or equivalent signed proof) for all customer-initiated redemptions; remove body-based identity override in production mode.

### C2) Host moderation auth is a single shared static secret with no secondary controls
- **Area:** Security review of host redemption endpoints
- **Why it matters:** Host endpoints trust only `x-host-key` equality check. Any leaked/reused key grants full moderation actions (`approve`/`reject`) over scoped events and can trigger irreversible point deductions through approval RPC.
- **Evidence:** `assertHostRequest()` compares one env key; host dashboard sends this key from browser state in every moderation request.
- **Hardening direction:** Move to per-user auth (short-lived signed tokens / RBAC), rotateable credentials, and endpoint rate limiting + audit trails.

### C3) No explicit RLS/policy definitions in migrations for rewards/check-in tables
- **Area:** RLS review
- **Why it matters:** Migrations create `customers`, `check_ins`, `points_ledger`, and `reward_redemptions`, but do not explicitly enable and define RLS policies. Security posture then depends on external defaults/grants, which is brittle and environment-dependent.
- **Evidence:** DDL adds tables/functions/indexes but no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` statements.
- **Hardening direction:** Explicitly codify RLS + policies in migrations for all user-linked tables and RPC execution model.

## Moderate Risks

### M1) `/rewards` can appear as deploy 404 when app is served behind a subpath/base path
- **Area:** Why `/rewards` may 404 despite route existing
- **Why it matters:** Route file exists, but app uses hardcoded absolute paths (e.g., redirect and API fetches starting with `/...`). In subpath deployments/proxy mounts, canonical route may be `/base/rewards`; direct `/rewards` can 404 at edge/proxy layer.
- **Evidence:** Absolute redirect and fetch usage (e.g., `redirect('/checkin')`, `fetch('/api/...')`, referral link building to `/checkin?...`).
- **Hardening direction:** Base-path-aware routing/link construction and deployment-level route tests for `/rewards` on final public URL.

### M2) Event loading has fragile failure handling for host queue refresh
- **Area:** Event loading resilience
- **Why it matters:** In host loader, failed `/api/events` or pending-fetch requests return silently (no surfaced error state), which can hide moderation outages in production.
- **Evidence:** `HostRedemptionLoader` returns early on failed fetch without user-visible failure signal/retry strategy.
- **Hardening direction:** Add explicit error state, retry/backoff, and stale-data indicator for host queue.

### M3) Rate limit keying is easy to evade/poison in proxied environments
- **Area:** Check-in duplicate protection / API abuse resistance
- **Why it matters:** Rate limit key uses raw `x-forwarded-for` header string; spoofed or multi-hop header formats can fragment keys and weaken protections.
- **Evidence:** `checkRateLimit` keys derive directly from `request.headers.get('x-forwarded-for')` in check-in and redeem routes.
- **Hardening direction:** Normalize trusted client IP extraction via platform headers/trust chain and fallback strategy.

### M4) Rewards redemption insertion has split-path behavior that can drift from DB invariants
- **Area:** Rewards ledger integrity
- **Why it matters:** API first calls RPC `insert_reward_redemption`, but on 404 falls back to direct table insert. This dual path can bypass future DB-side validation encoded only in RPC and increase behavior drift between environments.
- **Evidence:** `POST /api/rewards/redeem` catch block inserts directly on RPC 404.
- **Hardening direction:** Standardize on a single authoritative DB path (prefer RPC), fail closed when missing.

### M5) Dead/unfinished host widgets increase operational confusion during incidents
- **Area:** Dead code cleanup candidates
- **Why it matters:** Placeholder widgets in host dashboard can be mistaken for live controls during production incidents.
- **Evidence:** explicit placeholder text and input-only widget with no backend behavior.
- **Hardening direction:** Remove, hide behind feature flags, or clearly mark non-production modules.

## Not flagged as risk (for clarity)
- Duplicate check-in protection at database level is materially present via unique index on `(customer_id, event_id)` and RPC `ON CONFLICT DO NOTHING` flow; this is a strength, not a weakness.
