export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '../../../../lib/customer-session';
import { normalizePhone } from '../../../../lib/phone';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { REWARDS } from '../../../../lib/rewards';
import { SupabaseRequestError, supabaseInsert, supabaseRpc, supabaseSelect } from '../../../../lib/utils';

type RedeemRequestBody = {
  reward_id?: string;
  reward_catalog_id?: string;
  customer_id?: string;
  phone?: string;
};

type RewardSummary = {
  total_points: number;
};

type PendingRedemption = { id: string };

type SessionContext = {
  customerId: string;
  eventId: string;
};

type CustomerLookup = {
  id: string;
};

async function buildSessionContext(request: Request, body: RedeemRequestBody): Promise<SessionContext | null> {
  if (body.customer_id) {
    const customerId = body.customer_id.trim();
    const rows = await supabaseSelect<{ event_id?: string | null }>(
      'check_ins',
      new URLSearchParams({
        select: 'event_id',
        customer_id: `eq.${customerId}`,
        order: 'created_at.desc',
        limit: '1',
      }),
    );

    const eventId = rows[0]?.event_id?.trim();
    if (!eventId) return null;

    return { customerId, eventId };
  }

  if (body.phone) {
    const normalized = normalizePhone(body.phone);
    if (!normalized) return null;

    const customers = await supabaseSelect<CustomerLookup>(
      'customers',
      new URLSearchParams({ select: 'id', phone_normalized: `eq.${normalized}`, limit: '1' }),
    );
    const customerId = customers[0]?.id;
    if (!customerId) return null;

    const rows = await supabaseSelect<{ event_id?: string | null }>(
      'check_ins',
      new URLSearchParams({
        select: 'event_id',
        customer_id: `eq.${customerId}`,
        order: 'created_at.desc',
        limit: '1',
      }),
    );

    const eventId = rows[0]?.event_id?.trim();
    if (!eventId) return null;

    return { customerId, eventId };
  }

  const token = getCustomerSessionTokenFromRequest(request);
  if (!token) return null;

  const session = await verifyCustomerSessionToken(token);
  if (!session) return null;

  return { customerId: session.customer_id, eventId: session.event_id };
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (!checkRateLimit(`redeem:${ip}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: 'Too many redemption attempts. Please wait a moment.' }, { status: 429 });
  }

  const body = (await request.json()) as RedeemRequestBody;
  const rewardId = body.reward_catalog_id?.trim() || body.reward_id?.trim() || '';

  if (!rewardId) return NextResponse.json({ ok: false, error: 'Missing reward id.' }, { status: 400 });

  const reward = REWARDS.find((item) => item.id === rewardId);
  if (!reward) return NextResponse.json({ ok: false, error: 'Unknown reward.' }, { status: 404 });

  const context = await buildSessionContext(request, body);
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Could not resolve customer/event context for redemption.' }, { status: 401 });
  }

  const existingPending = await supabaseSelect<PendingRedemption>(
    'reward_redemptions',
    new URLSearchParams({
      select: 'id',
      customer_id: `eq.${context.customerId}`,
      reward_id: `eq.${reward.id}`,
      event_id: `eq.${context.eventId}`,
      status: 'eq.pending',
      limit: '1',
    }),
  );
  if (existingPending.length > 0) {
    return NextResponse.json({ ok: false, error: 'This reward is already pending for this event.' }, { status: 409 });
  }

  const summary = await supabaseRpc<RewardSummary>('customer_rewards_summary', {
    p_customer_id: context.customerId,
  });

  if ((summary.total_points ?? 0) < reward.cost) {
    return NextResponse.json({ ok: false, error: 'Not enough points for this reward.' }, { status: 409 });
  }

  try {
    await supabaseRpc('insert_reward_redemption', {
      p_customer_id: context.customerId,
      p_event_id: context.eventId,
      p_reward_catalog_id: reward.id,
      p_phone: body.phone ? normalizePhone(body.phone) : null,
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 404) {
      try {
        await supabaseInsert('reward_redemptions', {
          customer_id: context.customerId,
          event_id: context.eventId,
          reward_id: reward.id,
          points_cost: reward.cost,
          status: 'pending',
          host_note: reward.host_note ?? null,
          customer_note: reward.customer_note ?? 'Show this screen to your host for approval.',
        });
      } catch (insertError) {
        if (insertError instanceof SupabaseRequestError && insertError.status === 409) {
          return NextResponse.json({ ok: false, error: 'This reward is already pending approval.' }, { status: 409 });
        }
        throw insertError;
      }
    } else if (error instanceof SupabaseRequestError && error.status === 409) {
      return NextResponse.json({ ok: false, error: 'This reward is already pending approval.' }, { status: 409 });
    } else {
      throw error;
    }
  }

  return NextResponse.json({
    ok: true,
    reward,
    customer_instruction:
      '✅ Show this confirmation screen to your host now. Redemption is pending until host approval.',
  });
}
