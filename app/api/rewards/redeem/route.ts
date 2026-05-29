export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '../../../../lib/customer-session';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { REWARDS } from '../../../../lib/rewards';
import { supabaseRpc } from '../../../../lib/utils';

type RedeemRequestBody = {
  reward_id?: string;
  reward_catalog_id?: string;
};

type RedemptionResult = {
  ok?: boolean;
  redemption_id?: string;
  status?: string;
  reward_slug?: string;
  points_cost?: number;
  error?: string;
  message?: string;
};

type SessionContext = {
  customerId: string;
  eventId: string;
};

async function buildSessionContext(request: Request): Promise<SessionContext | null> {
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

  let body: RedeemRequestBody;
  try {
    body = (await request.json()) as RedeemRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const rewardSlug = body.reward_catalog_id?.trim() || body.reward_id?.trim() || '';
  if (!rewardSlug) return NextResponse.json({ ok: false, error: 'Missing reward id.' }, { status: 400 });

  const reward = REWARDS.find((item) => item.id === rewardSlug);
  if (!reward) return NextResponse.json({ ok: false, error: 'Unknown reward.' }, { status: 404 });

  const context = await buildSessionContext(request);
  if (!context) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid customer session token.' }, { status: 401 });
  }

  const result = await supabaseRpc<RedemptionResult>('insert_reward_redemption_v2', {
    p_customer_id: context.customerId,
    p_event_id: context.eventId,
    p_reward_slug: reward.id,
    p_host_note: reward.host_note ?? null,
    p_customer_note: reward.customer_note ?? 'Show this screen to your host for approval.',
  });

  if (!result?.ok) {
    return NextResponse.json(
      { ok: false, error: result?.error || result?.message || 'Unable to request reward redemption.' },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    redemption_id: result.redemption_id ?? null,
    status: result.status ?? 'pending',
    points_cost: result.points_cost ?? reward.cost,
    reward,
    customer_instruction:
      '✅ Show this confirmation screen to your host now. Redemption is pending until host approval.',
  });
}
