import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '../../../../lib/customer-session';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { REWARDS } from '../../../../lib/rewards';
import { SupabaseRequestError, supabaseInsert, supabaseRpc, supabaseSelect } from '../../../../lib/utils';

type RedeemRequestBody = {
  reward_id?: string;
};

type RewardSummary = {
  total_points: number;
  total_visits: number;
};

type PendingRedemption = { id: string };

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (!checkRateLimit(`redeem:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many redemption attempts. Please wait a moment.' }, { status: 429 });
  }

  const token = getCustomerSessionTokenFromRequest(request);
  if (!token) return NextResponse.json({ error: 'Missing customer session token.' }, { status: 401 });

  const session = await verifyCustomerSessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired customer session token.' }, { status: 401 });
  }

  const body = (await request.json()) as RedeemRequestBody;
  const rewardId = body.reward_id?.trim();
  if (!rewardId) return NextResponse.json({ error: 'Missing reward_id.' }, { status: 400 });

  const reward = REWARDS.find((item) => item.id === rewardId);
  if (!reward) return NextResponse.json({ error: 'Unknown reward.' }, { status: 404 });

  const existingPending = await supabaseSelect<PendingRedemption>(
    'reward_redemptions',
    new URLSearchParams({
      select: 'id',
      customer_id: `eq.${session.customer_id}`,
      reward_id: `eq.${reward.id}`,
      event_id: `eq.${session.event_id}`,
      status: 'eq.pending',
      limit: '1',
    }),
  );
  if (existingPending.length > 0) {
    return NextResponse.json({ error: 'This reward is already pending for this event.' }, { status: 409 });
  }

  const pendingCount = await supabaseSelect<PendingRedemption>(
    'reward_redemptions',
    new URLSearchParams({
      select: 'id',
      customer_id: `eq.${session.customer_id}`,
      status: 'eq.pending',
      limit: '5',
    }),
  );
  if (pendingCount.length >= 5) {
    return NextResponse.json(
      { error: 'Too many pending redemptions. Ask a host to review current requests first.' },
      { status: 409 },
    );
  }

  const summary = await supabaseRpc<RewardSummary>('customer_rewards_summary', {
    p_customer_id: session.customer_id,
  });

  if ((summary.total_points ?? 0) < reward.cost) {
    return NextResponse.json({ error: 'Not enough points for this reward.' }, { status: 409 });
  }

  try {
    await supabaseInsert('reward_redemptions', {
      customer_id: session.customer_id,
      event_id: session.event_id,
      reward_id: reward.id,
      points_cost: reward.cost,
      status: 'pending',
      host_note: reward.host_note ?? null,
      customer_note: reward.customer_note ?? 'Show this screen to your host for approval.',
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 409) {
      return NextResponse.json({ error: 'This reward is already pending approval.' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    ok: true,
    reward,
    customer_instruction:
      '✅ Show this confirmation screen to your host now. Redemption is pending until host approval.',
  });
}
