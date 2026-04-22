import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '@/lib/customer-session';
import { supabaseSelect } from '@/lib/utils';

type CustomerRewardRow = {
  id: string;
  customer_id: string;
  event_id: string;
  reward_id?: string | null;
  points_balance?: number | null;
  updated_at?: string | null;
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

  const params = new URLSearchParams({
    select: 'id,customer_id,event_id,reward_id,points_balance,updated_at',
    customer_id: `eq.${session.customer_id}`,
    event_id: `eq.${session.event_id}`,
    order: 'updated_at.desc',
  });

  const rewards = await supabaseSelect<CustomerRewardRow>('customer_rewards', params);
  return NextResponse.json({ rewards });
}
