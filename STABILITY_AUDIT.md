# Four Dogs Rewards/Check-in Stability Audit

Date: 2026-04-27  
Repo: `/workspace/Four-Dogs`  
Audit mode: **stability/readiness** (no redesign, no architecture rewrite)

---

## 1) Executive Summary

### Is the app ready for live venue use?
**Conditionally yes for small-to-moderate live use, but not yet robust enough for heavier public promotion without hardening.**

Core check-in and points awarding paths are present and compile cleanly, and there is DB-level duplicate check-in protection (`check_ins(customer_id, event_id)` unique index + conflict-safe RPC flow). However, several reliability and abuse-resistance gaps could break trust under heavier load or adversarial usage.

### Where could the core user journey break?
Most likely breakpoints:
1. **Event load failures** (check-in blocked if `/api/events` fails).  
2. **Rewards identity mismatch** (lookup by phone can view another user’s balance; redemption requires session token and may fail if user came from `/rewards` without prior check-in in same browser).  
3. **Host moderation auth model** (single shared key entered client-side; compromise affects all host actions).  
4. **Redeem path drift** (`insert_reward_redemption` RPC is called, but not defined in migrations; route falls back to direct insert).  
5. **In-memory rate limiting only** (not durable/distributed across serverless instances).

### What would prevent customers from earning or redeeming rewards?
- Failure to load events means no event selection and no check-in submit.
- Invalid/expired/missing customer session blocks redemption API.
- Pending duplicate redemption conflict blocks repeated attempts (expected), but UX feedback is weak in host flow.
- If host queue fetch fails silently, pending redemptions can appear “missing.”
- If Supabase write paths degrade, check-ins and approvals fail immediately.

---

## 2) Core User Journey Audit (end-to-end)

Flow audited:
**event selection → check-in form → customer creation/reuse → points awarded → rewards balance visible → reward redemption → host approval flow**

### A) Event selection
**Current behavior**
- Check-in form fetches `/api/events`, selects live event first, else first upcoming.

**Failure modes**
- API/network failure: user gets “Unable to load events…” and cannot submit.
- No live/upcoming events returned: submit disabled.

**Security risks**
- Low direct security risk, but route currently exposes raw backend error object in some failures (could leak internals).

**Data integrity risks**
- If wrong event is auto-selected due to stale view of live status, check-in may post against unintended event.

**UX friction risks**
- No retry/backoff UI or explicit offline fallback on check-in page.

### B) Check-in form submission
**Current behavior**
- Requires name + phone + selected event; email optional.
- Phone normalized server-side; RPC `checkin_with_rewards` handles create/reuse and point grants.

**Failure modes**
- Bad JSON / invalid phone / missing event => 400.
- Event missing => 404.
- RPC/DB errors => generic 500.

**Security risks**
- Rate limit keying relies on `x-forwarded-for` header string and in-memory map (weak against distributed spoof/rotation).

**Data integrity risks**
- Team name is captured client-side but not persisted (not breaking mission, but potentially confusing).

**UX friction risks**
- Generic “Check-in failed” on many backend failures; limited actionable guidance at venue.

### C) Customer creation/reuse
**Current behavior**
- Upsert by `phone_normalized` in RPC.
- Existing display_name/email updated only when new values provided.

**Failure modes**
- Shared/incorrect phone numbers merge identity unexpectedly.

**Security risks**
- Phone acts as account key without OTP or identity proof.

**Data integrity risks**
- Intentional/accidental phone reuse can attribute points to wrong person.

**UX friction risks**
- No correction/recovery flow for wrong number entry.

### D) Points awarded
**Current behavior**
- Base +1 check-in, +2 first visit, +2 every 10th visit, referral bonuses when conditions pass.
- Duplicate event check-in returns success with `duplicate_checkin=true`, no extra points.

**Failure modes**
- If RPC unavailable, no points or check-in record.
- Referral logic depends on single transactional function path.

**Security risks**
- Service-role backend bypasses client-side RLS constraints by design; must trust API surface hardening.

**Data integrity risks**
- Points ledger is append-only by convention but lacks DB-level guardrails against arbitrary negative/positive inserts outside approved functions.

**UX friction risks**
- Duplicate check-in surfaced as conflict in some conditions; user may not understand “already checked in” vs true failure.

### E) Rewards balance visible
**Current behavior**
- `/api/customer-rewards` supports phone lookup OR session token.
- Rewards page primarily uses phone lookup.

**Failure modes**
- Lookup returns 404 if number not found.
- Session token expired/missing => 401 if no phone query.

**Security risks**
- Any user who knows a phone can retrieve that account’s points/visits/name (privacy/enum risk).

**Data integrity risks**
- Read-only risk; no direct mutation.

**UX friction risks**
- Ambiguous identity model (phone lookup on one page, session-bound redemption on another).

### F) Reward redemption
**Current behavior**
- Requires valid customer session token.
- Checks pending duplicate + points balance.
- Attempts `insert_reward_redemption` RPC, falls back to direct insert on RPC 404.

**Failure modes**
- No valid session => 401 (common if user starts at rewards lookup without same-browser check-in).
- RPC undefined in schema => fallback path always used in current migrations.
- Concurrent redemptions may produce conflict/race but pending unique index limits duplicates.

**Security risks**
- Positive: body `customer_id` is ignored; context comes from signed session.
- Remaining: phone is still accepted in body for metadata insertion; should not be identity source.

**Data integrity risks**
- Split write paths (RPC vs direct insert) can drift in business rules over time.

**UX friction risks**
- “Request submitted” message doesn’t include queue state/ETA; user uncertain whether host sees it.

### G) Host approval flow
**Current behavior**
- Host enters shared key in browser; API checks `x-host-key` equality.
- Queue scoped by event id.
- Approve path uses atomic RPC `approve_reward_redemption` with row lock + points sufficiency check.

**Failure modes**
- Missing event scope header => 400.
- Queue loader silently returns on failures (no visible error state).
- Network drop after action can cause uncertain state perception.

**Security risks**
- Shared static host key is high-value secret exposed to every host device/browser.

**Data integrity risks**
- Approvals are strong (atomic deduction + status update), but reject path writes directly without standardized audit metadata.

**UX friction risks**
- No prominent error feedback for moderation API failures.

---

## 3) Critical Risks

1. **Host auth model is a shared static secret sent from browser clients**  
   - If leaked once, attacker can approve/reject for scoped events.

2. **Rewards balance endpoint allows phone-based account lookup without proof of ownership**  
   - Privacy leakage and possible scraping/enum of known phone numbers.

3. **Redemption write path inconsistency (`insert_reward_redemption` RPC missing in migrations)**  
   - Behavior depends on fallback direct insert; future rule drift likely.

4. **No explicit RLS/policy definitions in provided migrations for rewards/check-in tables**  
   - Security posture depends on external project defaults; brittle for production environments.

5. **In-memory rate limiting is not durable/distributed**  
   - Ineffective under multi-instance/serverless scale; abuse and burst control weak for heavy public use.

---

## 4) Moderate Risks

1. **Host queue loader swallows fetch failures with no operator-visible error state.**
2. **Event load path on check-in has no retry/backoff controls and blocks all check-ins when failing.**
3. **Identity mismatch UX: rewards lookup by phone but redemption requires session from check-in.**
4. **`/api/events` error responses can include backend details/hints/codes.**
5. **No explicit DB constraints on redemption status enum-like values (stored as free text).**
6. **No explicit index for event-scoped pending queue (`event_id`,`status`,`created_at`) despite host queue dependence.**

---

## 5) Low-priority cleanup

1. Placeholder host widgets (`AddTeamModal`, `QRCodeDisplay`, `PlayerSearch`) can confuse operations.
2. `EventStatusControl` prop type includes `hostKey` but component ignores it.
3. README is minimal and does not include operational runbook/setup details.

---

## 6) Route-by-route audit

## Web routes

### `/`
- **Purpose:** Entry route redirecting to `/checkin`.
- **Failure modes:** If redirect behavior affected by base-path/proxy misconfig, first load confusion.
- **Hardening suggestions:** Add deploy smoke test to verify redirect target under production URL.

### `/checkin`
- **Purpose:** Event select + participant intake + check-in.
- **Failure modes:** Event fetch failure blocks submission; mobile network interruptions cause retries/duplicates perception.
- **Hardening suggestions:** Add explicit retry action, stale cached event fallback, and clearer duplicate-vs-failure messaging.

### `/rewards`
- **Purpose:** Phone lookup for points and reward redemption actions.
- **Failure modes:** Lookup may work but redemption fails due to missing session token.
- **Hardening suggestions:** Align identity UX (session-first or explicit re-auth flow) without changing architecture.

### `/host`
- **Purpose:** Host moderation dashboard for pending redemptions.
- **Failure modes:** Silent loader failures hide queue outages; shared key handling risks exposure.
- **Hardening suggestions:** Surface fetch errors, last-updated timestamp, and scoped-event health state.

## API routes

### `GET /api/events`
- **Purpose:** Retrieve open/live/upcoming events.
- **Failure modes:** DB read failures return empty events + error object.
- **Hardening suggestions:** Sanitize error payload for public clients; include deterministic fallback status.

### `POST /api/checkin`
- **Purpose:** Validate check-in payload, verify event, run `checkin_with_rewards`, issue customer session cookie.
- **Failure modes:** Invalid inputs, event not found, RPC errors, rate-limit false positives.
- **Hardening suggestions:** Stronger client IP extraction, distributed limiter, and error categorization for venue staff.

### `GET /api/customer-rewards`
- **Purpose:** Return points balance + rewards availability by phone or session token.
- **Failure modes:** Missing account returns 404; expired session returns 401.
- **Hardening suggestions:** Add anti-enumeration controls (rate-limit, obfuscated response pattern, proof-of-ownership option).

### `POST /api/rewards/redeem`
- **Purpose:** Create pending redemption after points sufficiency checks.
- **Failure modes:** Missing/expired session; 409 conflicts; DB write/RPC failures.
- **Hardening suggestions:** Remove split-path fallback drift by ensuring single authoritative insert routine exists and is required.

### `GET /api/host/redemptions`
- **Purpose:** List pending redemptions for host-scoped event.
- **Failure modes:** Missing scope/key => 400/401; DB failure bubbles up.
- **Hardening suggestions:** Add explicit endpoint rate limits and request audit logging.

### `POST /api/host/redemptions/[id]/approve`
- **Purpose:** Approve redemption atomically and deduct points.
- **Failure modes:** Scope mismatch/not found; non-pending status conflict.
- **Hardening suggestions:** Include idempotent response semantics and operator-friendly error codes.

### `POST /api/host/redemptions/[id]/reject`
- **Purpose:** Mark pending redemption as rejected.
- **Failure modes:** Non-pending or wrong scope => 409.
- **Hardening suggestions:** Record `approved_by`/actor and reason on rejects for audit parity with approvals.

---

## 7) Database and rewards logic audit

Tables reviewed against requested checklist:

### `events`
- **Observed usage:** Read via REST select for event list/details.
- **Risks:** No explicit audit of constraints here in repo migrations (table likely pre-existing).
- **Suggestion:** Ensure index on status/time fields used by event list ordering/filtering.

### `customers`
- **Strengths:** Unique normalized phone index; referral code unique index.
- **Risks:** Phone as sole identity key; no verification binding.

### `check_ins`
- **Strengths:** Unique `(customer_id,event_id)` prevents duplicate points for same event.
- **Risks:** `event_id` typed `text` with no FK to `events.id` (integrity drift possible).

### `rewards`
- **Status:** No dedicated `rewards` table in migrations; reward catalog currently code-defined in `lib/rewards.ts`.
- **Risk:** Catalog/version drift between app and DB records if future backend logic assumes table-backed rewards.

### `points_ledger`
- **Strengths:** Append-style ledger, indexed by customer.
- **Risks:** No DB check constraint on `delta`/`reason` patterns; insufficient guardrails against out-of-band writes.

### `reward_catalog`
- **Status:** Not present as DB table; catalog in app code.
- **Risk:** Harder to manage live reward changes safely without deploy.

### `reward_redemptions`
- **Strengths:** Pending unique partial index avoids duplicate pending per reward/event/customer.
- **Risks:** `status` free text (no enum/check); no FK for `event_id`; likely missing composite index optimized for host queue.

### `reward_actions`
- **Status:** Not present.
- **Risk:** No dedicated action history table for moderation audit trail.

### `event_shares`
- **Status:** Not present in migrations provided.
- **Risk:** Referral/share analytics cannot be independently reconciled.

### Requested checks summary
- **Unique constraints:** Present for phone, check-in duplicate prevention, pending redemption duplicate prevention.
- **Duplicate prevention:** Good for check-ins and pending redemptions; moderate for abuse at lookup layer.
- **Ledger integrity:** Stronger on approval transaction; weaker on broad write guardrails and schema constraints.
- **Redemption correctness:** Approval RPC is atomic/lock-safe; insert path split between undefined RPC and direct insert.
- **RLS posture:** Not explicitly enabled/policy-defined in provided migrations.
- **Indexes:** Basic indexes present; host queue and event linkage indexing can be improved.
- **Foreign keys:** Customer FKs present; event and reward identifiers are text without FK constraints.
- **Race conditions:** Approval flow protected via `FOR UPDATE`; lookup/redeem/host polling still susceptible to stale UI race perceptions.
- **Abuse prevention:** Minimal (in-memory limiter + static host key); needs stronger production controls before heavy promotion.

---

## 8) Stress test thinking (40–60 concurrent players, multi-redeem bursts, weak Wi‑Fi, mobile-only)

### What breaks first?
1. **Front-end reliability under weak Wi‑Fi**
   - Event loading and host queue polling are brittle and can fail silently (host) or block check-in (customer).

2. **Rate-limit effectiveness under burst**
   - In-memory limiter won’t coordinate across instances; abusive patterns can slip through.

3. **Operational clarity in host flow**
   - Missing explicit error states leads to “is queue empty or broken?” ambiguity.

4. **Identity/session confusion on rewards redemption**
   - Users entering phone on rewards page from fresh browser context can see balance but fail redemption due to missing session cookie.

### What likely holds up?
- Duplicate check-in prevention and atomic approval deduction logic should hold under concurrency if Supabase remains healthy.

---

## 9) Live-event incident playbook

### If event list fails
1. Verify `/api/events` health directly from browser and server logs.
2. Confirm Supabase URL/key env vars and DB availability.
3. Temporarily instruct hosts to keep manual fallback list of active event ID.
4. If unresolved in minutes, activate manual check-in capture (name/phone/email) for later replay.

### If check-in fails
1. Check `/api/checkin` response codes (400/404/409/429/500).
2. Validate event exists and phone normalization not empty.
3. Confirm `checkin_with_rewards` RPC availability.
4. Switch to offline capture sheet to prevent guest loss; replay when backend recovers.

### If rewards don’t show
1. Test `/api/customer-rewards` by phone and by session context.
2. Verify customer exists and ledger summary RPC responding.
3. Communicate temporary delay clearly at venue; avoid duplicate redemption submissions.

### If host approval fails
1. Validate host key and event scope headers.
2. Re-query pending queue for same event.
3. If approval RPC failing, pause redemptions and log redemption IDs for delayed processing.

### If Supabase is degraded
1. Enter “manual mode”: capture check-ins/redemptions locally (timestamped).
2. Stop automatic redemption approvals to avoid inconsistent deductions.
3. After recovery, replay queue in deterministic order.

### If Vercel is degraded
1. Confirm edge/API route availability from multiple devices.
2. Move to manual check-in + redemption queue capture.
3. Post recovery notice and reconcile from captured records.

---

## 10) Fixes ranked

## Fix before next live event
1. Add visible error/retry states in host queue loader and check-in event loader.
2. Eliminate redemption insert ambiguity by ensuring `insert_reward_redemption` exists and is used consistently.
3. Harden public rewards lookup against easy phone enumeration (at least stronger rate limiting + response normalization).
4. Add operational logging for host approve/reject actions (who/when/event/redemption id).

## Fix before heavy promotion
1. Replace in-memory limiter with shared durable limiter.
2. Strengthen host authentication model (rotatable scoped credentials, shorter lifetime, better secret handling).
3. Explicitly codify RLS + policies in migrations for all rewards/check-in tables.
4. Add DB check constraints / enums for redemption status and required fields.
5. Add composite indexes for host queue performance at scale.

## Fix later
1. Clean up placeholder host widgets or flag them clearly as non-operational.
2. Expand README/runbook with incident and rollback procedures.
3. Add richer customer recovery UX for wrong phone entry cases.

---

## 11) NEW PROMPT REQUEST (Phase-two hardening prompt)

Use this prompt in a fresh Codex run:

```md
Audit context:
We already performed a stability audit of the Four Dogs rewards/check-in app. Now do phase-two hardening only.

Mission-critical flow to protect:
event selection -> check-in (name/phone/email optional) -> points accrual -> rewards balance -> redemption -> host approval.

Constraints:
- NO architecture rewrites.
- NO broad redesign.
- Make only minimal-risk, production-hardening improvements.
- Preserve current UX structure and routes.

Tasks:
1) Implement robust error visibility + retry controls for:
   - check-in event loading
   - host pending redemption loading
   (keep UI design consistent, minimal changes)

2) Unify redemption insert path:
   - ensure a single authoritative DB insert routine is used (prefer RPC)
   - remove behavior drift between environments
   - keep existing API contract unchanged

3) Tighten abuse controls with low-risk changes:
   - improve rate-limit key extraction and handling
   - add stronger limits on phone-based rewards lookup to reduce enumeration risk

4) Improve host moderation operational safety:
   - add structured logs for approve/reject actions and key failure states
   - keep existing host route contracts unchanged

5) Database hardening (minimal and additive only):
   - add missing indexes for host queue performance
   - add safe constraints for redemption status integrity
   - do not drop or rewrite existing tables

6) Validation:
   - run npm run build
   - list all changed files
   - summarize risks mitigated by each change

Deliverables:
- Code changes only for the above
- Brief HARDENING_CHANGES.md with:
  - what changed
  - why it is low risk
  - what risk it mitigates
```

---

## Build verification
- Command run: `npm run build`
- Result: **PASS** (Next.js production build completed successfully).
