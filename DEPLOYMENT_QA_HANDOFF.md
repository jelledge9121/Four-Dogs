# Four Dogs Stabilization Handoff (Deployment + QA)

## 1) Deployment checklist (short)
1. Apply migration: `supabase/migrations/20260423_rewards_system.sql` in Supabase SQL editor.
2. Verify RPCs exist and are callable:
   - `checkin_with_rewards`
   - `customer_rewards_summary`
   - `approve_reward_redemption`
3. Deploy Next.js app to production.
4. Confirm env vars are set (see prerequisites below).
5. Smoke test key routes:
   - `/` redirects to `/checkin`
   - `/checkin` loads and submits
   - `/host` loads host gate and pending queue

## 2) Production prerequisites
### Environment variables
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (server routes require service role privileges)
- `CUSTOMER_SESSION_SECRET` (for customer session token signing)
- `HOST_DASHBOARD_KEY` (required for host moderation endpoints)

### Database prerequisites
- Existing `customers` table with `id` PK (UUID compatible) must exist.
- `events` table/API data must provide valid event IDs used by check-in.
- Migration file must be executed successfully (tables/indexes/functions).

## 3) Manual live-event QA checklist (short)
1. **First visit**: new phone checks in -> points include base + first-visit bonus.
2. **Milestone visit**: same customer reaches visit 10 -> exact milestone bonus applies.
3. **Duplicate submit**: same customer/event check-in twice -> second is duplicate-safe, no extra points.
4. **Pending redemption**: redeem available reward -> status queued as `pending` and customer message says show host.
5. **Approval**: host approves pending reward -> points deducted once, status becomes `approved`.
6. **Rejection**: host rejects pending reward -> status `rejected`, no point deduction.
7. **Drink reward**: host sees explicit ID-check requirement before approval.
8. **Shirt reward**: host/customer see explicit Joey/Four Dogs fulfillment instruction + Blue/Green choice note.

## 4) Notes
- Host moderation queue is intentionally event-scoped (`event_id`) and requires host event scope header/query.
- Approval logic re-checks live balance transactionally in RPC before deduction.
