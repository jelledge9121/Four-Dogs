# Four Dogs Degraded/Offline Mode Resilience Plan

Date: 2026-04-27  
Scope: **Planning only** (no implementation in this change)  
Goal: Preserve the mission-critical live-event flow during weak Wi‑Fi or backend degradation with minimal additive changes.

---

## 1) Mission and success criteria

### Mission during degradation
When connectivity is unstable (venue Wi‑Fi, cellular congestion, Supabase/Vercel partial outage), the app should **degrade gracefully** so guests can still:
1. Submit check-in intent
2. Receive immediate local confirmation state
3. Continue rewards interactions in a controlled fallback mode
4. Let hosts fulfill/approve with operational continuity
5. Reconcile accurately after recovery (no double points, no duplicate approvals)

### Success criteria
- No customer is “lost” because of transient network failure.
- Check-ins captured offline are eventually synced or safely escalated to manual reconciliation.
- Duplicate check-ins and duplicate redemptions remain prevented after reconnect.
- Hosts have a clear emergency workflow when moderation APIs are unavailable.
- Recovery from outage is deterministic and auditable.

---

## 2) Failure model assumptions

Design for these realistic event conditions:
- 40–60 users arriving within short windows.
- Mixed network quality (some devices online, some offline).
- Temporary 5xx/timeout spikes from Vercel or Supabase.
- Mobile-only usage with background tab suspension.
- Short-lived host-side disconnections during redemption moderation.

Outage categories:
1. **Client connectivity degraded** (customer cannot reach API reliably).
2. **App API degraded** (Vercel route latency/timeouts/errors).
3. **Database degraded** (Supabase errors/rate limits).
4. **Host-only partial outage** (customer paths work, host moderation fails).

---

## 3) Minimal additive architecture (no rewrites)

Use existing app routes/APIs and add a small resilience layer:

1. **Client-side operation queue** (local persistent queue)
   - Queue operation types:
     - `checkin_submit`
     - `redeem_request`
   - Local storage medium: IndexedDB preferred; `localStorage` only as emergency fallback.

2. **Retry coordinator**
   - Background retry with exponential backoff + jitter.
   - Trigger retries on:
     - `online` event
     - app focus regain
     - periodic timer while page open

3. **Idempotency envelope for queued operations**
   - Include `client_operation_id` (UUID) on each queued item.
   - Send this to API on sync for dedupe-safe server handling.

4. **Host emergency manual queue**
   - In host UI, add explicit “Manual Mode” toggle when API health fails.
   - Hosts can log approvals/rejections locally with timestamps.

5. **Reconciliation pipeline after recovery**
   - Replay queued operations in deterministic order.
   - Resolve conflicts by pre-defined rules (see section 8).

This is intentionally additive and compatible with current session/RPC structure.

---

## 4) Customer check-in degraded mode plan

### 4.1 Normal behavior (unchanged)
- Attempt online `POST /api/checkin` first.

### 4.2 Degraded behavior trigger
Enter degraded mode for check-in when request fails due to:
- Network error/timeout
- HTTP 5xx
- explicit “backend unavailable” health signal

### 4.3 Queue capture payload (minimum fields)
For each queued check-in:
- `client_operation_id`
- `event_id`
- `name`
- `phone_normalized` (or raw + normalized)
- `email` (optional)
- `referral_code` (optional)
- `created_at_client`
- `attempt_count`
- `last_error`
- `status` (`queued | syncing | synced | conflict | failed_manual_review`)

### 4.4 Immediate UX in degraded mode
- Show clear state: “Saved locally, will sync automatically when connection returns.”
- Display queue badge/count.
- Provide “Retry now” button.
- Provide “Show capture details” so guest can confirm what was stored.

### 4.5 Sync behavior
- Replay queued check-ins oldest-first.
- On successful sync, mark item `synced` and store returned server identifiers/points summary.
- On duplicate response, treat as resolved (not failure) and mark `synced_duplicate`.

---

## 5) Rewards/redeem degraded mode plan

Because redemption correctness is sensitive, use stricter fallback rules than check-in.

### 5.1 Online-first redemption (unchanged)
- Try `POST /api/rewards/redeem` normally.

### 5.2 Degraded fallback behavior
When offline/degraded:
- Queue a **redemption intent** locally (not approved, not deducted locally).
- UI message: “Request saved; final redemption requires host approval after sync.”
- Do **not** fake points deduction locally.

### 5.3 Redemption intent payload
- `client_operation_id`
- `reward_id`
- `event_id` (from session context)
- `customer_hint` (phone/session fingerprint where safe)
- `created_at_client`
- `status` (`queued | syncing | pending_host | conflict | failed_manual_review`)

### 5.4 Sync outcomes
- If server accepts -> pending host approval as normal.
- If conflict (already pending/insufficient points) -> mark conflict with operator-facing reason.
- If auth/session expired -> require re-auth/re-checkin context before retry.

---

## 6) Retry strategy

### 6.1 Backoff policy
- Base delay: 2s
- Backoff: exponential (2s, 4s, 8s, 16s, up to cap e.g. 2 min)
- Add jitter: ±20%
- Reset delay on successful operation sync

### 6.2 Retry classes
- Retryable: network errors, 408, 429, 5xx
- Non-retryable without user action: 400, 401 (unless refreshed), 404 event missing, schema validation errors

### 6.3 Guardrails
- Maximum attempts before escalation flag (e.g., 12 attempts).
- Surface queue items requiring manual review.
- Avoid infinite retry loops in background tabs.

---

## 7) Local fallback storage and privacy posture

### 7.1 Storage priorities
1. IndexedDB for structured queue and statuses.
2. localStorage fallback for minimal emergency capture if IndexedDB fails.

### 7.2 Data minimization
Store only required fields for replay/reconciliation:
- Name, phone, optional email, event id, referral code, timestamps, operation status.

### 7.3 Safety controls
- TTL cleanup (e.g., auto-prune synced items after 7 days, failed after operator export).
- Device-visible warning: “This device temporarily stores check-in data for sync.”
- “Clear local queue” admin action for hosts after reconciliation.

---

## 8) Reconciliation and duplicate prevention after reconnect

## 8.1 Check-ins
Use a layered dedupe approach:
1. Existing server uniqueness (`customer_id,event_id`) remains primary.
2. Add `client_operation_id` idempotency tracking server-side (recommended additive table/index) to prevent replay duplicates from flaky retries.
3. Treat server duplicate responses as successful reconciliation, not errors.

## 8.2 Redemptions
1. Keep existing pending uniqueness (`customer_id,reward_id,event_id,status=pending`).
2. Add optional `client_operation_id` dedupe tracking for redemption intents.
3. On reconnect conflicts:
   - Already pending => mark resolved/pending_host
   - Insufficient points => mark manual follow-up

## 8.3 Conflict resolution rules (deterministic)
- “Already exists” = success-equivalent reconciliation.
- “Auth expired” = retry blocked until identity restored.
- “Invalid event/reward” = manual review.
- Persist conflict reason code for operator visibility.

---

## 9) Host emergency manual mode

When host APIs fail, host needs continuity without silent failure.

### 9.1 Entry conditions
- Failed pending queue loads beyond threshold (e.g., 3 consecutive failures)
- Approve/reject endpoint unavailable

### 9.2 Manual mode capabilities (minimal)
- Record manual redemption decision locally:
  - `manual_action_id`
  - redemption/customer descriptor
  - reward id
  - decision (`approved_manual` / `rejected_manual`)
  - host name
  - timestamp
  - notes
- Show prominent banner: “Emergency Manual Mode — not yet synced.”

### 9.3 Exit and sync
- Once APIs recover, host can replay manual actions to server with confirmation prompts.
- Detect already-processed records and mark as reconciled.
- Export unresolved manual actions (CSV/JSON) for post-event audit.

---

## 10) Operational UX states to add (minimal)

### Customer UI
- Connectivity badge: Online / Degraded / Offline.
- Submission result states:
  - Sent
  - Saved locally
  - Syncing
  - Synced
  - Needs review

### Host UI
- Queue health indicator with last successful refresh timestamp.
- Manual mode toggle + local action counter.
- “Sync now” and “Export unresolved” controls.

These are lightweight state/feedback additions, not redesigns.

---

## 11) Observability and incident support

Add structured logs/metrics for degraded operation:
- queue_depth
- sync_success_count
- sync_conflict_count
- sync_failure_count
- oldest_queued_age_seconds
- manual_mode_active
- manual_actions_pending

Operational alerts (basic):
- queue depth above threshold
- oldest queued item age above threshold
- repeated host queue refresh failures

---

## 12) Phased implementation plan (minimal-risk)

### Phase A — Must-have before heavier promotion
1. Customer check-in queue + retry + statuses.
2. Host/API health indicators and visible error states.
3. Deterministic conflict handling for duplicate check-ins on replay.

### Phase B — Strongly recommended
1. Redemption intent queue with conservative semantics.
2. Host manual mode local capture + replay tooling.
3. Idempotency keys (`client_operation_id`) server-side acceptance/tracking.

### Phase C — Hardening follow-up
1. Export/reconciliation utilities.
2. Metrics dashboards + alert thresholds.
3. Data retention and cleanup tooling for local queues.

---

## 13) Acceptance tests for degraded-mode rollout

1. **Offline check-in capture:** disable network, submit check-in, verify queued + user confirmation.
2. **Reconnect replay:** restore network, verify queued check-in syncs once.
3. **Duplicate replay safety:** force repeated retries for same operation, verify single server-side check-in effect.
4. **Backend 5xx burst:** simulate intermittent failures, verify backoff and eventual sync.
5. **Host manual mode:** block host APIs, log manual decisions, restore API, replay and reconcile.
6. **Redemption conflict handling:** queue redemption, consume points elsewhere, reconnect, verify conflict surfaced cleanly.
7. **App restart persistence:** close/reopen tab, verify queue survives and resumes.

---

## 14) Non-goals (to keep scope minimal)

- No architecture rewrite.
- No new auth system redesign in this phase.
- No full offline-first rewards ledger on client.
- No change to existing customer/host route contracts beyond additive metadata/idempotency support.

---

## 15) Deliverables for implementation phase (future)

When implementing this plan, produce:
1. `DEGRADE_MODE_IMPLEMENTATION.md` with final behavior and reconciliation rules.
2. Updated runbook section for live-event staff (customer + host steps).
3. Basic QA checklist script for pre-event connectivity drills.

