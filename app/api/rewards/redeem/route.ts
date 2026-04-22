import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '../../../../lib/customer-session';
import { SupabaseRequestError, supabaseRpc } from '../../../../lib/utils';

type RedeemRequestBody = {
  reward_id?: string | null;
};

type RedeemRpcResult = {
  ok: boolean;
  points_spent?: number;
  error_code?: 'DUPLICATE_REDEMPTION' | 'INSUFFICIENT_POINTS' | 'REWARD_NOT_FOUND' | 'EVENT_SCOPE_MISMATCH' | string;
  error_message?: string;
};

export async function POST(request: Request) {
  const token = getCustomerSessionTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing customer session token.' }, { status: 401 });
  }

  const session = await verifyCustomerSessionToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired customer session token.' }, { status: 401 });
  }

  const body = (await request.json()) as RedeemRequestBody;
  const rewardId = body.reward_id?.trim();
  if (!rewardId) {
    return NextResponse.json({ error: 'Missing reward_id.' }, { status: 400 });
  }

  try {
    const result = await supabaseRpc<RedeemRpcResult>('redeem_reward_transactional', {
      p_customer_id: session.customer_id,
      p_event_id: session.event_id,
      p_reward_id: rewardId,
    });

    if (!result?.ok) {
      if (result?.error_code === 'DUPLICATE_REDEMPTION') {
        return NextResponse.json({ error: 'Reward already redeemed.' }, { status: 409 });
      }
      if (result?.error_code === 'INSUFFICIENT_POINTS') {
        return NextResponse.json({ error: 'Insufficient points balance.' }, { status: 409 });
      }
      if (result?.error_code === 'REWARD_NOT_FOUND' || result?.error_code === 'EVENT_SCOPE_MISMATCH') {
        return NextResponse.json({ error: 'Reward not found or inactive.' }, { status: 404 });
      }

      return NextResponse.json(
        { error: result?.error_message ?? 'Reward redemption failed.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, reward_id: rewardId, points_spent: result.points_spent ?? null });
  } catch (error) {
    if (error instanceof SupabaseRequestError) {
      if (error.status === 404) {
        return NextResponse.json(
          {
            error:
              'Transactional rewards RPC is required. Deploy redeem_reward_transactional() before enabling redemption.',
          },
          { status: 501 },
        );
      }

      if (error.status === 409) {
        return NextResponse.json({ error: 'Reward already redeemed.' }, { status: 409 });
      }
    }

    throw error;
  }
}
