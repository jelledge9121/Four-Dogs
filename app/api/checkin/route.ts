export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import { createCustomerSessionToken } from '../../../lib/customer-session';
import { checkRateLimit } from '../../../lib/rate-limit';
import { buildRewardSnapshot } from '../../../lib/rewards';
import { normalizePhone } from '../../../lib/phone';
import { SupabaseRequestError, getEventByIdFromDatabase, supabaseRpc, supabaseSelect } from '../../../lib/utils';

type CheckinBody = {
  event_id?: string;
  phone?: string;
  name?: string;
  email?: string;
  referral_code?: string;
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
  referral_code?: string | null;
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type CustomerAdminRow = {
  id: string;
  full_name?: string | null;
  is_admin?: boolean | null;
};

async function getCustomerAdminByPhone(inputPhone: string): Promise<{ customerId: string | null; isAdmin: boolean }> {
  const normalizedInput = normalizePhone(inputPhone);
  if (!normalizedInput) return { customerId: null, isAdmin: false };

  const rows = await supabaseSelect<CustomerAdminRow>(
    'customers',
    new URLSearchParams({
      select: 'id,full_name,is_admin',
      phone_normalized: `eq.${normalizedInput}`,
      limit: '1',
    }),
  );

  const row = rows[0];
  return {
    customerId: row?.id ?? null,
    isAdmin: Boolean(row?.is_admin),
  };
}

function shouldRetryWithoutReferral(error: unknown): boolean {
  if (!(error instanceof SupabaseRequestError)) return false;
  if (![400, 404].includes(error.status)) return false;

  const details = (error.details ?? '').toLowerCase();
  return details.includes('p_referral_code') || details.includes('function public.checkin_with_rewards');
}

async function runCheckinRpc(params: {
  eventId: string;
  phone: string;
  name: string;
  email: string;
  referralCode: string;
}): Promise<CheckinRpcResult> {
  try {
    return await supabaseRpc<CheckinRpcResult>('checkin_with_rewards', {
      p_event_id: params.eventId,
      p_phone_normalized: params.phone,
      p_name: params.name || null,
      p_email: params.email || null,
      p_referral_code: params.referralCode || null,
    });
  } catch (error) {
    if (!shouldRetryWithoutReferral(error)) throw error;

    return supabaseRpc<CheckinRpcResult>('checkin_with_rewards', {
      p_event_id: params.eventId,
      p_phone_normalized: params.phone,
      p_name: params.name || null,
      p_email: params.email || null,
    });
  }
}

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
    const referralCode = body.referral_code?.trim().toUpperCase() ?? '';

    if (!eventId) return NextResponse.json({ error: 'Missing event_id.' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'A valid phone number is required.' }, { status: 400 });

    const dbEvent = await getEventByIdFromDatabase(eventId);
    if (!dbEvent) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const { isAdmin } = await getCustomerAdminByPhone(body.phone ?? '');
    const eventStatus = (dbEvent.status ?? '').toLowerCase();
    if (!isAdmin && eventStatus !== 'live') {
      return NextResponse.json(
        { error: 'Check-in is only available while this event is live.' },
        { status: 403 },
      );
    }

    try {
      const result = await runCheckinRpc({ eventId, phone, name, email, referralCode });
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
        referral_code: result.referral_code ?? null,
        ...rewardSnapshot,
      });

      response.headers.append('Set-Cookie', buildSessionCookie(sessionToken));
      return response;
    } catch (error) {
      if (error instanceof SupabaseRequestError) {
        const details = (error.details ?? '').toLowerCase();
        const hint = (error.hint ?? '').toLowerCase();
        const message = (error.message ?? '').toLowerCase();

        if (
          error.status === 409 ||
          details.includes('duplicate') ||
          message.includes('duplicate') ||
          hint.includes('duplicate')
        ) {
          return NextResponse.json({ error: 'This customer is already checked in for this event.' }, { status: 409 });
        }
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
