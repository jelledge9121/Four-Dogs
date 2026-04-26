export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import {
  getCustomerSessionTokenFromRequest,
  verifyCustomerSessionToken,
} from '../../../lib/customer-session';
import { normalizePhone } from '../../../lib/phone';
import { REWARDS } from '../../../lib/rewards';
import { getEventByIdFromDatabase, supabaseRpc, supabaseSelect } from '../../../lib/utils';

type RewardSummary = {
  total_points: number;
  total_visits: number;
};

type CustomerRow = {
  id: string;
  display_name?: string | null;
};

type LatestCheckInRow = {
  event_id?: string | null;
};

type RewardCatalogItem = {
  id: string;
  name: string;
  description: string;
  points_cost: number;
};

function toCatalogItem(): RewardCatalogItem[] {
  return REWARDS.map((reward) => ({
    id: reward.id,
    name: reward.title,
    description: reward.description,
    points_cost: reward.cost,
  }));
}

function splitRewards(points: number) {
  const catalog = toCatalogItem();
  return {
    available: catalog.filter((reward) => reward.points_cost <= points),
    locked: catalog.filter((reward) => reward.points_cost > points),
  };
}

async function resolveCustomerFromPhone(phoneRaw: string): Promise<CustomerRow | null> {
  const normalized = normalizePhone(phoneRaw);
  if (!normalized) return null;

  const rows = await supabaseSelect<CustomerRow>(
    'customers',
    new URLSearchParams({
      select: 'id,display_name',
      phone_normalized: `eq.${normalized}`,
      limit: '1',
    }),
  );

  return rows[0] ?? null;
}

async function resolveVenueName(customerId: string): Promise<string> {
  const latestCheckin = await supabaseSelect<LatestCheckInRow>(
    'check_ins',
    new URLSearchParams({
      select: 'event_id',
      customer_id: `eq.${customerId}`,
      order: 'created_at.desc',
      limit: '1',
    }),
  );

  const eventId = latestCheckin[0]?.event_id?.trim();
  if (!eventId) return 'Four Dogs Entertainment';

  const event = await getEventByIdFromDatabase(eventId);
  return event?.venue_name ?? 'Four Dogs Entertainment';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const phoneParam = url.searchParams.get('phone')?.trim() ?? '';

  let customerId = '';
  let fullName = 'Rewards Member';

  if (phoneParam) {
    const customer = await resolveCustomerFromPhone(phoneParam);
    if (!customer?.id) {
      return NextResponse.json({ ok: false, error: 'Could not find an account with that number.' }, { status: 404 });
    }

    customerId = customer.id;
    fullName = customer.display_name?.trim() || 'Rewards Member';
  } else {
    const token = getCustomerSessionTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing phone number or customer session token.' }, { status: 401 });
    }

    const session = await verifyCustomerSessionToken(token);
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired customer session token.' }, { status: 401 });
    }

    customerId = session.customer_id;

    const rows = await supabaseSelect<CustomerRow>(
      'customers',
      new URLSearchParams({ select: 'id,display_name', id: `eq.${customerId}`, limit: '1' }),
    );
    fullName = rows[0]?.display_name?.trim() || 'Rewards Member';
  }

  const summary = await supabaseRpc<RewardSummary>('customer_rewards_summary', {
    p_customer_id: customerId,
  });

  const points = summary.total_points ?? 0;
  const visits = summary.total_visits ?? 0;
  const venueName = await resolveVenueName(customerId);
  const rewardBuckets = splitRewards(points);

  return NextResponse.json({
    ok: true,
    customer_id: customerId,
    full_name: fullName,
    points_balance: points,
    visits,
    venue_name: venueName,
    ...rewardBuckets,
  });
}
