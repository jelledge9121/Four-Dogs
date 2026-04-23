import { NextResponse } from 'next/server';

import { createCustomerSessionToken } from '../../../lib/customer-session';
import { checkRateLimit } from '../../../lib/rate-limit';
import { buildRewardSnapshot } from '../../../lib/rewards';
import { normalizePhone } from '../../../lib/phone';
import { SupabaseRequestError, getEventByIdFromDatabase, supabaseRpc } from '../../../lib/utils';

type CheckinBody = {
  event_id?: string;
  phone?: string;
  name?: string;
  email?: string;
};

type CheckinRpcResult = {
  ok: boolean;
  duplicate_checkin?: boolean;
  customer_id: string;
  checkin_id?: string;
  points_earned: number;
  total_points: number;
  total_visits: number;
  bonuses_earned: string[];
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function buildSessionCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  return [
    `customer_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(isProduction ? ['Secure'] : []),
  ].join('; ');
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    if (!checkRateLimit(`checkin:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: 'Too many check-in attempts. Please wait a moment.' }, { status: 429 });
    }

    let body: CheckinBody;
    try {
      body = (await request.json()) as CheckinBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const eventId = body.event_id?.trim() ?? '';
    const phone = normalizePhone(body.phone ?? '');
    const name = body.name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';

    if (!eventId) return NextResponse.json({ error: 'Missing event_id.' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'A valid phone number is required.' }, { status: 400 });

    const dbEvent = await getEventByIdFromDatabase(eventId);
    if (!dbEvent) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    try {
      const result = await supabaseRpc<CheckinRpcResult>('checkin_with_rewards', {
        p_event_id: eventId,
        p_phone_normalized: phone,
        p_name: name || null,
        p_email: email || null,
      });
      console.log('[checkin RPC result]', result);

      if (!result?.ok) {
        return NextResponse.json({ error: 'Unable to process check-in.' }, { status: 409 });
      }

      const sessionToken = await createCustomerSessionToken(result.customer_id, eventId);
      const rewardSnapshot = buildRewardSnapshot(result.total_points ?? 0);

      const response = NextResponse.json({
        ok: true,
        duplicate_checkin: Boolean(result.duplicate_checkin),
        points_earned: result.points_earned ?? 0,
        total_points: result.total_points ?? 0,
        total_visits: result.total_visits ?? 0,
        bonuses_earned: result.bonuses_earned ?? [],
        ...rewardSnapshot,
      });

      response.headers.append('Set-Cookie', buildSessionCookie(sessionToken));
      return response;
    } catch (error) {
      if (error instanceof SupabaseRequestError && error.status === 409) {
        return NextResponse.json({ error: 'This customer is already checked in for this event.' }, { status: 409 });
      }

      throw error;
    }
  } catch (error) {
    console.error('[api/checkin] failed', error);
    return NextResponse.json(
      { error: 'Check-in failed. Please try again.' },
      { status: 500 },
    );
  }
}
