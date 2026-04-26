# Route Audit (Next.js App Router)

Date: 2026-04-26

## 1) App routes (pages)

- `/` → redirects to `/checkin`.
- `/checkin` → check-in page.
- `/rewards` → rewards lookup/redeem page.
- `/host` → host dashboard page.

## 2) API routes

- `GET /api/events`
- `POST /api/checkin`
- `GET /api/customer-rewards`
- `POST /api/rewards/redeem`
- `GET /api/host/redemptions`
- `POST /api/host/redemptions/[id]/approve`
- `POST /api/host/redemptions/[id]/reject`

## 3) Orphaned routes referenced in code but missing

No missing app/API routes were found from static string references currently in the codebase.

Verified references include:

- App references: `/checkin`.
- API references: `/api/events`, `/api/checkin`, `/api/customer-rewards`, `/api/rewards/redeem`, and dynamic host moderation path `/api/host/redemptions/:id/(approve|reject)`.

## 4) Routes that should exist but 404

None identified from current implementation.

## 5) Dead code or unfinished features

Likely unfinished/placeholder host dashboard widgets:

- `components/AddTeamModal.tsx` renders "Team add modal placeholder.".
- `components/QRCodeDisplay.tsx` renders "QR display placeholder".
- `components/PlayerSearch.tsx` has local input state only and no data/query action.
- `components/EventStatusControl.tsx` accepts `hostKey` in its type signature but does not use it.

## /rewards verification

`/rewards` **does exist** as a concrete app route (`app/rewards/page.tsx`). The current code also includes dedicated rewards APIs and a `RewardsLookup` UI used by this page, indicating `/rewards` is the intended route (not an accidental reference to a missing alternative).
