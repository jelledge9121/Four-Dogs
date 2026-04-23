import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '../../../lib/customer-session';
import { buildRewardSnapshot } from '../../../lib/rewards';
import { supabaseRpc, supabaseSelect } from '../../../lib/utils';

type RewardSummary = {
  total_points: number;
  total_visits: number;
};

type PendingRedemption = {
  id: string;
  reward_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

export async function GET(request: Request) {
  const token = getCustomerSessionTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing customer session token.' }, { status: 401 });
  }

  const session = await verifyCustomerSessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired customer session token.' }, { status: 401 });
  }

  const summary = await supabaseRpc<RewardSummary>('customer_rewards_summary', {
    p_customer_id: session.customer_id,
  });

  const pending = await supabaseSelect<PendingRedemption>(
    'reward_redemptions',
    new URLSearchParams({
      select: 'id,reward_id,status,created_at',
      customer_id: `eq.${session.customer_id}`,
      status: 'eq.pending',
      order: 'created_at.desc',
    }),
  );

  const rewardSnapshot = buildRewardSnapshot(summary.total_points ?? 0);

  return NextResponse.json({
    total_points: summary.total_points ?? 0,
    total_visits: summary.total_visits ?? 0,
    pending_redemptions: pending,
    ...rewardSnapshot,
  });
}
