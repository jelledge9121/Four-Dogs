# Pre-launch Security & Reliability Audit

Date: 2026-06-05
Scope: Next.js App Router API/UI code, Supabase migration files in this repository, dependency/build/type checks, and repository secret scanning. This is a repository-only audit; live Supabase settings, deployed RPC bodies, Edge/runtime logs, and production environment variables were not inspected.

## Launch-blocker checklist (Critical / High)

- [ ] **High — Replace the host dashboard shared static key with per-user/role-based auth and rate-limited sessions.** Evidence: `app/api/host/auth/verify/route.ts:12`, `app/api/host/auth/verify/route.ts:29`, `lib/host-auth.ts:4`, `lib/host-auth.ts:9`, `components/HostAuthGate.tsx:34`, `components/HostAuthGate.tsx:37`.
- [ ] **High — Rework Supabase service-role usage and enforce RLS/policies in migrations.** Evidence: `lib/utils.ts:82`, `lib/utils.ts:84`, `lib/utils.ts:167`, `lib/utils.ts:172`, `supabase/migrations/20260423_rewards_system.sql:17`, `supabase/migrations/20260423_rewards_system.sql:28`, `supabase/migrations/20260423_rewards_system.sql:40`.
- [ ] **High — Add anti-abuse proof and stronger throttling for check-ins/referrals/bonus actions.** Evidence: `app/api/checkin/route.ts:109`, `app/api/checkin/route.ts:111`, `app/api/checkin/route.ts:123`, `app/api/checkin/route.ts:132`, `app/api/bonus-actions/route.ts:40`, `supabase/migrations/20260425_referrals.sql:94`.
- [ ] **High — Put all redemption integrity RPCs in migrations and verify affordability/idempotency before launch.** Evidence: `app/api/rewards/redeem/route.ts:69`, `app/api/host/redemptions/[id]/approve/route.ts:47`, `supabase/migrations/20260423_rewards_system.sql:160`, `supabase/migrations/20260423_rewards_system.sql:191`, `supabase/migrations/20260423_rewards_system.sql:195`.
- [ ] **High — Add privacy/consent controls for phone/email collection and host-visible PII.** Evidence: `supabase/migrations/20260423_rewards_system.sql:7`, `supabase/migrations/20260423_rewards_system.sql:8`, `supabase/migrations/20260423_rewards_system.sql:10`, `app/api/checkin/route.ts:124`, `app/api/checkin/route.ts:126`, `app/api/host/redemptions/route.ts:52`.

## Findings

### 1. High — Host dashboard is protected only by one shared static key

**Evidence:** Host verification compares `body.host_key` directly to `HOST_DASHBOARD_KEY` (`app/api/host/auth/verify/route.ts:12`, `app/api/host/auth/verify/route.ts:24`, `app/api/host/auth/verify/route.ts:29`), and every protected host route later accepts the same value in `x-host-key` (`lib/host-auth.ts:4`, `lib/host-auth.ts:9`, `lib/host-auth.ts:10`). The browser sends the raw key to `/api/host/auth/verify` and keeps it in React state for subsequent fetches (`components/HostAuthGate.tsx:34`, `components/HostAuthGate.tsx:37`, `app/host/page.tsx:111`, `app/host/page.tsx:152`).

**Risk:** A leaked key from any host device grants full dashboard/API access until manually rotated, with no user attribution, no role boundary, no device revocation, and no rate-limited login endpoint. Direct string comparison also gives no lockout or replay protection.

**Concrete fix:** Replace this gate with Supabase Auth or another per-host identity provider, issue short-lived signed server sessions in HttpOnly cookies, scope hosts to venue/event roles, add login rate limiting and audit logs, and support immediate credential revocation/rotation. Use constant-time comparison only as a temporary mitigation while migrating away from the shared secret.

### 2. High — API routes use the Supabase service-role key broadly, bypassing RLS from application code

**Evidence:** `getSupabaseKey('write')` requires `SUPABASE_SERVICE_ROLE_KEY` (`lib/utils.ts:82`, `lib/utils.ts:84`), and `supabaseRpc` sends it as both `apikey` and bearer authorization for all RPC calls (`lib/utils.ts:167`, `lib/utils.ts:172`). Read paths prefer anon but fall back to the service-role key (`lib/utils.ts:91`, `lib/utils.ts:94`). Customer-facing check-in, redemption, customer summary, and bonus routes all reach these helpers/RPCs (`app/api/checkin/route.ts:78`, `app/api/rewards/redeem/route.ts:69`, `app/api/customer-rewards/route.ts:88`, `app/api/bonus-actions/route.ts:41`).

**Risk:** Any API-route authorization bug becomes a database superuser-style operation from the app's point of view because service-role requests bypass Supabase RLS. Falling back to service role for reads also turns otherwise public/listing endpoints into privileged queries if anon configuration is absent.

**Concrete fix:** Use the service-role key only in minimal, audited server-only modules; use anon/user JWT clients where RLS should apply; remove service-role fallback for reads; and add explicit ownership checks before every service-role call. Keep the service-role key out of any `NEXT_PUBLIC_*` variable and rotate it if it may have been exposed.

### 3. High — Migrations do not enable RLS or define table policies for the loyalty tables

**Evidence:** The migrations create/alter `check_ins`, `points_ledger`, and `reward_redemptions` (`supabase/migrations/20260423_rewards_system.sql:17`, `supabase/migrations/20260423_rewards_system.sql:28`, `supabase/migrations/20260423_rewards_system.sql:40`) but the repository contains no `alter table ... enable row level security` or `create policy` statements for these tables.

**Risk:** If anon/authenticated clients ever query Supabase directly, or if a future code path starts using the anon key client-side, sensitive PII, ledger, and redemption data may be readable or mutable beyond intended access. Because migrations are the source of truth for reproducible environments, missing RLS also makes staging/production drift likely.

**Concrete fix:** Add migrations that enable RLS on every loyalty table (`customers`, `check_ins`, `points_ledger`, `reward_redemptions`, and any `events`/`venues` tables if managed here), define least-privilege policies, and grant RPC execution only to intended roles. Keep `SECURITY DEFINER` functions narrow and revoke direct table writes from anon/authenticated roles where not required.

### 4. High — Check-in and referral endpoints are directly callable and rely mainly on phone/event input plus in-memory IP throttling

**Evidence:** `/api/checkin` accepts unauthenticated POSTs (`app/api/checkin/route.ts:109`), trusts body-provided `event_id`, phone, name, email, and referral code after basic trimming/normalization (`app/api/checkin/route.ts:123`, `app/api/checkin/route.ts:124`, `app/api/checkin/route.ts:126`, `app/api/checkin/route.ts:127`), checks only that the event exists/live (`app/api/checkin/route.ts:132`, `app/api/checkin/route.ts:137`, `app/api/checkin/route.ts:139`), and uses an in-memory bucket keyed by the raw `x-forwarded-for` header (`app/api/checkin/route.ts:111`, `app/api/checkin/route.ts:112`, `lib/rate-limit.ts:18`, `lib/rate-limit.ts:20`). Referral awards are granted on first visit when a code matches another customer (`supabase/migrations/20260425_referrals.sql:94`, `supabase/migrations/20260425_referrals.sql:101`, `supabase/migrations/20260425_referrals.sql:112`, `supabase/migrations/20260425_referrals.sql:121`).

**Risk:** Anyone can script fake check-ins for live events, use many phone numbers, and farm referral points without being present at the venue. The in-process rate limiter resets on deploy/server restart, does not coordinate across instances, and is only as reliable as trusted proxy header handling.

**Concrete fix:** Require an event-specific signed QR token or rotating venue code, validate presence with short expiry and nonce/replay protection, move rate limiting to a shared store/WAF keyed on normalized IP/device/phone/event, and require stronger referral fraud controls such as delayed awards, per-referrer caps, phone verification, and anomaly review.

### 5. High — Reward-redemption integrity depends on RPCs not present in the repo

**Evidence:** Customer redemption calls `insert_reward_redemption_v2` (`app/api/rewards/redeem/route.ts:69`) and customer summaries call `get_customer_reward_summary` (`app/api/customer-rewards/route.ts:88`), but the migration files in this repo only define `customer_rewards_summary`, `checkin_with_rewards`, and `approve_reward_redemption` (`supabase/migrations/20260423_rewards_system.sql:60`, `supabase/migrations/20260423_rewards_system.sql:72`, `supabase/migrations/20260423_rewards_system.sql:160`). The approval RPC does perform a row lock and affordability check (`supabase/migrations/20260423_rewards_system.sql:173`, `supabase/migrations/20260423_rewards_system.sql:176`, `supabase/migrations/20260423_rewards_system.sql:191`), then inserts a negative ledger entry (`supabase/migrations/20260423_rewards_system.sql:195`).

**Risk:** Launch reproducibility is broken: a fresh database from repo migrations will not have functions the app requires, and the critical insertion-time checks for affordability, reward catalog validity, duplicate pending redemptions, and replay/idempotency cannot be audited from source. Approval-time affordability helps, but a malicious user can still create operational load or confusing pending requests if insertion is weak.

**Concrete fix:** Add the exact definitions for `insert_reward_redemption_v2`, `get_customer_reward_summary`, and `award_bonus_action` to migrations; make redemption insertion validate the reward slug against an authoritative DB catalog, reject unaffordable requests or mark them clearly, enforce one pending request per customer/reward/event, and accept an idempotency key to make retries safe.

### 6. Medium — Bonus-action awards are client-asserted and can use a client-supplied event id

**Evidence:** The route validates only that `action` is one of `facebook_follow` or `event_share` (`app/api/bonus-actions/route.ts:19`, `app/api/bonus-actions/route.ts:35`, `app/api/bonus-actions/route.ts:36`) and passes `body.event_id` before falling back to the session event (`app/api/bonus-actions/route.ts:40`, `app/api/bonus-actions/route.ts:41`). The client calls it directly after a button click (`components/CheckInForm.tsx:218`, `components/CheckInForm.tsx:219`, `components/CheckInForm.tsx:222`).

**Risk:** Users can invoke the endpoint outside the UI and claim social/share bonuses without proof, and may attach bonus awards to arbitrary event ids unless the missing `award_bonus_action` RPC rejects them. This can inflate points and distort event analytics.

**Concrete fix:** Remove client-supplied `event_id` or require it to match the signed session event; implement DB uniqueness per customer/action/event; add proof callbacks where feasible; and cap/monitor bonus awards per customer/IP/device.

### 7. Medium — Rate limiting is incomplete and not production-resilient

**Evidence:** The only shared limiter is a process-local `Map` (`lib/rate-limit.ts:18`) with a simple fixed window counter (`lib/rate-limit.ts:20`, `lib/rate-limit.ts:24`, `lib/rate-limit.ts:29`), used on check-in and redeem (`app/api/checkin/route.ts:111`, `app/api/rewards/redeem/route.ts:46`). Host login, host redemptions, analytics, events, customer rewards, and bonus actions have no limiter in the route code (`app/api/host/auth/verify/route.ts:11`, `app/api/host/redemptions/route.ts:34`, `app/api/host/analytics/route.ts:13`, `app/api/events/route.ts:29`, `app/api/customer-rewards/route.ts:70`, `app/api/bonus-actions/route.ts:21`).

**Risk:** Brute-force attempts against the host key, enumeration of public events, and scripted bonus/customer-summary requests are not consistently throttled. In serverless or multi-instance deployments, the current limiter does not coordinate between instances and can be bypassed by instance churn.

**Concrete fix:** Add centralized rate limiting through the platform/WAF or a shared Redis/KV store, normalize and trust proxy IPs only through deployment-provided headers, and apply route-specific limits to host auth, host APIs, customer summary, events, bonus actions, check-in, and redemption.

### 8. Medium — `/api/events` leaks Supabase/internal error details to clients

**Evidence:** On `SupabaseRequestError`, the route returns `message`, `details`, `hint`, and `code` to the client (`app/api/events/route.ts:57`, `app/api/events/route.ts:58`, `app/api/events/route.ts:60`, `app/api/events/route.ts:63`, `app/api/events/route.ts:64`, `app/api/events/route.ts:65`, `app/api/events/route.ts:66`). For non-Supabase errors it returns the thrown error message (`app/api/events/route.ts:73`, `app/api/events/route.ts:77`).

**Risk:** Database errors can reveal schema names, function names, hints, or operational details useful to attackers and confusing to users. This conflicts with the otherwise generic user-facing errors in check-in/redeem.

**Concrete fix:** Return a stable generic client error and log structured server-side details with request id, route, status, and Supabase code; expose detailed diagnostics only in authenticated admin tooling or non-production environments.

### 9. Medium — Customer sessions are long-lived bearer/cookie tokens with no revocation, nonce, audience, or subject revalidation

**Evidence:** Session TTL is 12 hours (`lib/customer-session.ts:8`), tokens contain only `customer_id`, `event_id`, `iat`, and `exp` (`lib/customer-session.ts:1`, `lib/customer-session.ts:94`), verification checks signature and expiry but no revocation/audience/jti (`lib/customer-session.ts:123`, `lib/customer-session.ts:133`, `lib/customer-session.ts:145`), and tokens are accepted from either `Authorization: Bearer` or the `customer_session` cookie (`lib/customer-session.ts:151`, `lib/customer-session.ts:153`, `lib/customer-session.ts:157`). The cookie is HttpOnly/SameSite=Lax and Secure only in production (`app/api/checkin/route.ts:97`, `app/api/checkin/route.ts:102`, `app/api/checkin/route.ts:103`, `app/api/checkin/route.ts:105`).

**Risk:** A stolen token can redeem or claim bonus actions until expiry, and there is no server-side way to invalidate it after suspicious activity, phone-number correction, or event cancellation. Because the token does not re-check customer/event state, changes in the database may not take effect until expiry.

**Concrete fix:** Add `sub`, `aud`, `iss`, `jti`, and version claims; store session ids or token versions for revocation; shorten TTL for high-risk actions; revalidate customer/event status before redemption/bonus awards; and rotate `CUSTOMER_SESSION_SECRET` with key ids.

### 10. Medium — Host event scoping is a client-supplied filter, not an authorization boundary

**Evidence:** Host pending redemptions accept `event_id` from the query string or `x-host-event-id` (`app/api/host/redemptions/route.ts:38`, `app/api/host/redemptions/route.ts:39`, `app/api/host/redemptions/route.ts:40`) and then filter by that value (`app/api/host/redemptions/route.ts:49`, `app/api/host/redemptions/route.ts:54`). Approval/rejection likewise trust `x-host-event-id` for scope checks (`app/api/host/redemptions/[id]/approve/route.ts:32`, `app/api/host/redemptions/[id]/approve/route.ts:37`, `app/api/host/redemptions/[id]/approve/route.ts:39`, `app/api/host/redemptions/[id]/reject/route.ts:24`, `app/api/host/redemptions/[id]/reject/route.ts:29`, `app/api/host/redemptions/[id]/reject/route.ts:34`).

**Risk:** With the shared host key, any host can choose any event id and view or act on that event's redemptions. This is acceptable only if all hosts are intentionally global admins, which is high risk for a public launch.

**Concrete fix:** Bind host identities to allowed venues/events server-side, derive event scope from those roles, and reject client-supplied event ids outside the host's assignments.

### 11. Medium — SECURITY DEFINER RPCs validate only minimal input and depend on app-side live-event checks

**Evidence:** `checkin_with_rewards` is `SECURITY DEFINER` (`supabase/migrations/20260425_referrals.sql:24`, `supabase/migrations/20260425_referrals.sql:25`, `supabase/migrations/20260425_referrals.sql:26`) and only checks that normalized phone is present (`supabase/migrations/20260425_referrals.sql:39`, `supabase/migrations/20260425_referrals.sql:40`) before inserting/updating customer, check-in, and ledger rows (`supabase/migrations/20260425_referrals.sql:43`, `supabase/migrations/20260425_referrals.sql:59`, `supabase/migrations/20260425_referrals.sql:82`). It does not validate that `p_event_id` exists, is live, or belongs to an allowed venue inside the database function.

**Risk:** If the RPC is callable by anon/authenticated roles, or if a server route later forgets the app-side event-live guard, the function can write points for arbitrary event ids. SECURITY DEFINER functions are especially sensitive because they execute with elevated database privileges.

**Concrete fix:** Validate event existence/live status and input formats inside the RPC, restrict `execute` grants to the minimum role needed, add explicit `check` constraints/foreign keys where possible, and keep app-side checks as defense-in-depth rather than the only gate.

### 12. Medium — Privacy and consent requirements are not represented in code

**Evidence:** The schema stores `phone_normalized`, `display_name`, and `email` on `customers` (`supabase/migrations/20260423_rewards_system.sql:7`, `supabase/migrations/20260423_rewards_system.sql:8`, `supabase/migrations/20260423_rewards_system.sql:9`, `supabase/migrations/20260423_rewards_system.sql:10`), and `/api/checkin` accepts phone/name/email (`app/api/checkin/route.ts:124`, `app/api/checkin/route.ts:125`, `app/api/checkin/route.ts:126`). Host redemptions expose customer ids and display names to the host dashboard (`app/api/host/redemptions/route.ts:52`, `app/api/host/redemptions/route.ts:63`, `app/api/host/redemptions/route.ts:64`, `app/api/host/redemptions/route.ts:65`).

**Risk:** Phone numbers and email addresses are PII and may trigger privacy-policy, retention, consent, access/deletion, and SMS/email marketing compliance obligations. Host dashboard exposure also requires internal access controls and minimization.

**Concrete fix:** Publish a privacy policy before launch, add consent text at check-in, document retention/deletion workflows, limit host-visible fields to operational need, and avoid logging PII or Supabase payloads that may contain PII.

### 13. Low — Generic user-facing failures are not paired with durable observability

**Evidence:** Check-in logs failures with `console.error` and returns a generic retry message (`app/api/checkin/route.ts:203`, `app/api/checkin/route.ts:204`, `app/api/checkin/route.ts:205`, `app/api/checkin/route.ts:206`). Redemption returns RPC-provided error/message or a generic fallback without a surrounding catch/logger (`app/api/rewards/redeem/route.ts:77`, `app/api/rewards/redeem/route.ts:79`). Client-side check-in and redemption render whatever route error/fallback they receive (`components/CheckInForm.tsx:191`, `components/CheckInForm.tsx:199`, `components/CheckInForm.tsx:241`, `components/CheckInForm.tsx:243`, `components/CheckInForm.tsx:252`, `components/CheckInForm.tsx:254`). Repository search found no Sentry/PostHog/logger integration beyond route-local `console.error`.

**Risk:** Users may get little guidance on fixable errors, while operators may lack durable, searchable context for failed check-ins/redemptions in production. Console-only logging can be lost or hard to correlate.

**Concrete fix:** Add structured logging/error monitoring with request ids and non-PII context, map known RPC errors to user-actionable copy (e.g., already checked in, insufficient points, reward already pending), and add alerting for spikes in 4xx/5xx/RPC failures.

### 14. Low — The suspected `customers.phone_normalized` check-in/admin lookup mismatch is not present in current repo migrations, but must be verified against the deployed RPC

**Evidence:** Admin lookup queries `customers.phone_normalized` (`app/api/checkin/route.ts:42`, `app/api/checkin/route.ts:43`, `app/api/checkin/route.ts:46`, `app/api/checkin/route.ts:50`). The current check-in route passes `p_phone_normalized` to the RPC (`app/api/checkin/route.ts:78`, `app/api/checkin/route.ts:80`), and both current migration versions of `checkin_with_rewards` insert into `customers(phone_normalized, display_name, email)` (`supabase/migrations/20260423_rewards_system.sql:95`, `supabase/migrations/20260423_rewards_system.sql:96`, `supabase/migrations/20260425_referrals.sql:43`, `supabase/migrations/20260425_referrals.sql:44`).

**Risk:** The suspected bug appears fixed in repository source, but if production still has an older RPC body or rows with null `phone_normalized`, admin override/lookup and duplicate prevention can behave incorrectly.

**Concrete fix:** In Supabase, inspect `pg_get_functiondef('public.checkin_with_rewards(...)'::regprocedure)` and backfill/normalize existing customer phones; add a `not null` or partial integrity constraint when safe.

## Points & redemption integrity notes

- Point balances are derived from `points_ledger` sums, not a mutable denormalized balance, in the repo-defined summary function (`supabase/migrations/20260423_rewards_system.sql:60`, `supabase/migrations/20260423_rewards_system.sql:67`) and approval function (`supabase/migrations/20260423_rewards_system.sql:186`, `supabase/migrations/20260423_rewards_system.sql:188`). This reduces balance drift risk, but only if all point mutations go through ledger inserts and all live functions match source.
- Duplicate check-ins are guarded by a unique index on `(customer_id, event_id)` (`supabase/migrations/20260423_rewards_system.sql:24`, `supabase/migrations/20260429_checkins_unique_customer_event.sql:38`, `supabase/migrations/20260429_checkins_unique_customer_event.sql:39`) and `on conflict ... do nothing` in the RPC (`supabase/migrations/20260425_referrals.sql:59`, `supabase/migrations/20260425_referrals.sql:61`). This prevents same-customer/same-event replay once the customer identity is correctly resolved by normalized phone.
- Approval cannot deduct twice if the row is no longer pending and is locked during approval (`supabase/migrations/20260423_rewards_system.sql:173`, `supabase/migrations/20260423_rewards_system.sql:176`, `supabase/migrations/20260423_rewards_system.sql:182`, `supabase/migrations/20260423_rewards_system.sql:195`, `supabase/migrations/20260423_rewards_system.sql:204`). Insert-time redemption replay/idempotency remains unverifiable because `insert_reward_redemption_v2` is absent from migrations.

## Enum/string-literal consistency review

- The repository migrations shown here do **not** define enum types for ledger reasons or redemption statuses; they use `text` columns for `points_ledger.reason` and `reward_redemptions.status` (`supabase/migrations/20260423_rewards_system.sql:33`, `supabase/migrations/20260423_rewards_system.sql:46`). Therefore, the previously suspected `ledger_type = 'referral'` style mismatch cannot be confirmed from these migrations.
- String literals used in SQL/code include redemption statuses `pending`, `approved`, `rejected` (`supabase/migrations/20260423_rewards_system.sql:46`, `supabase/migrations/20260423_rewards_system.sql:206`, `app/api/host/redemptions/[id]/reject/route.ts:31`), ledger reasons `checkin_base`, `first_visit_bonus`, `milestone_visit_bonus`, `referral_bonus_receiver`, `referral_bonus_referrer`, and `reward_redemption_approved` (`supabase/migrations/20260425_referrals.sql:82`, `supabase/migrations/20260425_referrals.sql:90`, `supabase/migrations/20260425_referrals.sql:117`, `supabase/migrations/20260425_referrals.sql:126`, `supabase/migrations/20260423_rewards_system.sql:200`), and event statuses `live`, `upcoming`, `closed` (`lib/event-status.ts:1`, `app/api/events/route.ts:44`). Verify these against live database enum/check constraints if the production schema has stricter types than this repo.

## Secrets and exposed keys review

- No committed `.env` file or obvious literal Supabase/OpenAI/API secret was found by the repo secret scan command listed below. Matches were configuration names and documentation references, not actual key values.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SHOW_HOST_BETA` are referenced (`lib/utils.ts:74`, `lib/utils.ts:91`, `app/host/page.tsx:15`). `NEXT_PUBLIC_*` values are client-exposed by design; only publish anon-safe values, never service-role/customer-session/host keys.
- `DEPLOYMENT_QA_HANDOFF.md` documents required environment variables including `SUPABASE_SERVICE_ROLE_KEY`, `CUSTOMER_SESSION_SECRET`, and `HOST_DASHBOARD_KEY`; ensure those exist only in deployment secret stores and are rotated for launch.

## Verify in Supabase before launch

These risks depend on live database state or deployed functions that are not fully visible from the repo:

1. Confirm RLS is enabled and policies exist for every table, including pre-existing `customers`, `events`, and `venues`, not just tables created in these migrations.
2. Confirm grants on `checkin_with_rewards`, `approve_reward_redemption`, `insert_reward_redemption_v2`, `get_customer_reward_summary`, and `award_bonus_action`; revoke public execution where not required.
3. Export and review the deployed definitions for `insert_reward_redemption_v2`, `get_customer_reward_summary`, and `award_bonus_action`, because they are called by the app but absent from repo migrations.
4. Confirm live enum/check constraints include every literal used by code/SQL, especially ledger reasons and redemption statuses.
5. Confirm the deployed `checkin_with_rewards` writes `customers.phone_normalized`, and backfill any legacy customer rows where it is null.
6. Confirm indexes/constraints exist in production for `customers.phone_normalized`, `customers.referral_code`, `check_ins(customer_id,event_id)`, and pending reward redemptions.
7. Confirm Supabase Auth/API logs and platform logs do not store phone numbers, emails, host keys, customer session tokens, or service-role keys.
8. Confirm production proxy/IP headers are trusted and normalized before application rate-limit keys are derived.

## Read-only check results

- `npm audit` — **failed/warning:** npm could not run because this repo has no lockfile (`ENOLOCK`, `loadVirtual requires existing shrinkwrap file`). Create/commit a lockfile or run audit against the exact deployment lockfile.
- `npm run build` — **passed:** Next.js production build completed successfully.
- `npx tsc --noEmit` — **passed:** TypeScript completed with no errors. It generated `tsconfig.tsbuildinfo`, which was removed because this audit should add only `AUDIT.md`.
- Secret/API-key grep — **passed with review notes:** no obvious committed secret values were found; matches were env-var names, code references, docs, and generated build metadata before cleanup.
