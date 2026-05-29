export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import { getCustomerSessionTokenFromRequest, verifyCustomerSessionToken } from '../../../lib/customer-session';
import { supabaseRpc } from '../../../lib/utils';

type Body = { action?: 'facebook_follow' | 'event_share'; event_id?: string };
type BonusActionResult = {
  ok?: boolean;
  awarded?: boolean;
  points?: number;
  message?: string;
  error?: string;
};

const VALID_ACTIONS = new Set(['facebook_follow', 'event_share']);

export async function POST(request: Request) {
  const token = getCustomerSessionTokenFromRequest(request);
  if (!token) return NextResponse.json({ ok: false, error: 'Missing session.' }, { status: 401 });

  const session = await verifyCustomerSessionToken(token);
  if (!session) return NextResponse.json({ ok: false, error: 'Invalid session.' }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown bonus action.' }, { status: 400 });
  }

  const eventId = body.event_id?.trim() || session.event_id || null;
  const result = await supabaseRpc<BonusActionResult>('award_bonus_action', {
    p_customer_id: session.customer_id,
    p_action: action,
    p_event_id: eventId,
  });

  if (!result?.ok) {
    return NextResponse.json(
      { ok: false, awarded: false, error: result?.error || result?.message || 'Unable to award bonus action.' },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    awarded: Boolean(result.awarded),
    points: result.points ?? 0,
    message: result.message ?? (result.awarded ? 'Bonus points added.' : 'Already claimed.'),
  });
}
