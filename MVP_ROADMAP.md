# Four Dogs MVP Product Roadmap

Date: 2026-04-27  
Inputs used: `ROUTE_AUDIT.md`, `PRODUCTION_HARDENING_AUDIT.md`, `STABILITY_AUDIT.md`, `DEGRADE_MODE_PLAN.md`  
Roadmap intent: **phased, minimal-bloat plan** that maximizes attendance growth and repeat visits while protecting live-event reliability.

---

## Strategy anchor (what this roadmap optimizes)

Primary growth loop to protect and improve:
1. Guest checks in quickly at event
2. Guest earns visible points immediately
3. Guest returns to redeem meaningful rewards
4. Guest invites friends (share/referral)
5. Host processes redemption smoothly in-venue

Roadmap principle: **Reliability before feature depth.**  
If check-in, points, or redemption fail during events, retention features lose impact.

---

## Phase 1 — Pilot Ready (stable live use now)

### Objective
Make current web app reliable for repeated live events with low operational risk.

### Must-have features
1. **Core journey reliability hardening**
   - Robust error states + retry controls for event loading (`/checkin`, `/host`).
   - Clear duplicate vs failure messaging in check-in/redeem flows.

2. **Degraded/offline capture for check-ins (minimal)**
   - Queue failed check-ins locally.
   - Auto-retry on reconnect with deterministic status states.

3. **Redemption correctness hardening**
   - Single authoritative insertion path for redemptions (remove RPC/fallback drift).
   - Preserve atomic approval flow and improve host failure visibility.

4. **Basic abuse/security protections**
   - Improve request key extraction + rate limit posture.
   - Add stronger protections around phone-based rewards lookup enumeration risk.

5. **Host operational continuity**
   - Visible queue health state + last refreshed timestamp.
   - Emergency manual mode logging (capture first; replay can be basic).

6. **Data integrity guardrails (additive)**
   - Add missing constraints/indexes for host queue and redemption status consistency.
   - Add explicit migration-level RLS/policy posture documentation + enforcement.

### Key risks in this phase
- Host shared-key model remains a compromise risk unless minimally strengthened.
- Local queueing without idempotency can cause replay duplicates if not completed carefully.
- Operational burden increases if manual-mode tooling is unclear.

### Dependencies
- Small DB migration set (indexes, constraints, idempotency metadata as needed).
- Lightweight frontend state additions (queue status, retries, error banners).
- Basic logging/monitoring setup for queue health and API failures.

### Rough implementation complexity
**Medium** (many small changes across API/UI/DB, but no architecture rewrite).

### What NOT to build yet
- Full loyalty tier gamification.
- Complex campaign orchestration.
- Native mobile apps.
- Multi-venue enterprise RBAC platform.

---

## Phase 2 — Growth Ready (retention + scale features)

### Objective
Increase repeat attendance and referral growth after Phase 1 stability baseline is proven.

### Must-have features
1. **Share bonus + referrals (conversion-focused)**
   - Productionize referral/share loop already partially present.
   - Track referral attribution quality and abuse indicators.
   - Ensure referral bonus reconciliation under degraded sync conditions.

2. **Loyalty tiers (simple, behavior-driven)**
   - Add 2–3 tiers max (e.g., New / Regular / VIP) based on verified visit cadence.
   - Tier perks should map directly to attendance frequency, not complex points math.

3. **Host analytics (operator visibility)**
   - Event-level dashboard: check-ins, redemption requests, approval times, queue backlog.
   - Identify bottlenecks (e.g., slow approval windows, redemption conflicts).

4. **Push/SMS reminders (retention channel)**
   - Lightweight reminders for upcoming events and unused redeemable rewards.
   - Start with opt-in + simple cadence; avoid over-messaging.

5. **Degraded-mode expansion for redemptions**
   - Redemption-intent queue + conflict handling with clear host/customer messaging.

### Key risks in this phase
- Messaging abuse/compliance risk (SMS consent, opt-out handling).
- Referral fraud if anti-abuse controls lag growth tactics.
- Analytics misinterpretation if event/identity data quality remains inconsistent.

### Dependencies
- Stable identity/session behavior from Phase 1.
- Notification provider integration (SMS/push) with consent tracking.
- Event analytics schema additions + dashboard views.
- Basic experimentation framework (at least controlled rollout flags).

### Rough implementation complexity
**Medium–High** (cross-cutting product + data + messaging workflows).

### What NOT to build yet
- Advanced CRM segmentation engine.
- AI personalization/recommendation stack.
- Large social/community features.
- Overly granular tier ladders and dozens of reward variants.

---

## Phase 3 — App Store Ready (iOS/Android launch requirements)

### Objective
Package a reliable, policy-compliant, measurable mobile product for App Store + Play Store.

### Must-have features
1. **Mobile platform readiness**
   - Native shell or cross-platform app with stable auth/session behavior.
   - Deep link support for referral/share flows.
   - Offline queue parity with web degraded-mode model.

2. **Security + compliance baseline for mobile distribution**
   - Secret handling, secure storage, transport hardening, abuse throttling.
   - Clear privacy disclosures for phone/email/reward behavior.
   - SMS/push permission and consent UX aligned with platform policy.

3. **Operational reliability standards**
   - Crash/error monitoring, release channels, rollback plan.
   - API health indicators and runbook integration for event staff.

4. **Store readiness assets/process**
   - Onboarding UX polish for first-run conversion.
   - App metadata/screenshots, review notes, support URLs.

5. **Metrics required for mobile iteration**
   - Install → check-in conversion
   - D30 repeat attendance
   - Referral share-to-check-in conversion
   - Redemption completion rate

### Key risks in this phase
- Launching native apps before stabilizing operational workflows can amplify support load.
- App-store compliance delays if privacy/permission flows are underprepared.
- Duplicate logic divergence across web/mobile if shared contracts are not strictly enforced.

### Dependencies
- Phase 1 stability + Phase 2 retention mechanics proven in web.
- API contract maturity and idempotency guarantees.
- Mobile analytics + crash tooling + release ops.

### Rough implementation complexity
**High** (new platform surfaces, compliance, and release operations).

### What NOT to build yet
- Full marketplace ecosystem.
- Real-time chat/social feeds.
- Complex wallet/payments expansion unless directly tied to proven retention lift.

---

## Cross-phase priority stack (attendance + repeat visits)

Ranked by business impact and risk reduction:
1. **Always-working check-in + points posting** (trust foundation).
2. **Reliable redemption + host approval throughput** (visible value).
3. **Referral/share loop with anti-abuse controls** (attendance growth).
4. **Reminder channels with consent** (repeat visits).
5. **Tiering and analytics refinement** (retention optimization).
6. **Native app channel expansion** (distribution scale after fundamentals hold).

---

## Scope guardrails to prevent feature bloat

- Every feature must tie to one KPI: attendance, repeat visits, redemption completion, or referral conversion.
- Prefer additive extensions to existing routes and data model before creating new subsystems.
- Ship in narrow slices with event-by-event validation, not big-bang feature bundles.
- If reliability regressions appear, pause growth features and return to Phase 1 priorities.

---

## Suggested release gates

### Exit gate for Phase 1
- Core check-in/redeem/host flow stable across consecutive live events.
- Degraded-mode check-in queue + replay tested in real venue conditions.
- No unresolved critical security/data-integrity gaps from audits.

### Exit gate for Phase 2
- Referral/share and reminders demonstrate measurable repeat-visit uplift.
- Host analytics informs staffing/operations decisions.
- Abuse and consent controls validated.

### Exit gate for Phase 3
- Mobile beta achieves stable conversion/retention metrics.
- Crash rates and incident response meet launch thresholds.
- Store submission/compliance checklist fully satisfied.

