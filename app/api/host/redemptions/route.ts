import { NextResponse } from 'next/server';

import { assertHostRequest } from '../../../../lib/host-auth';
import { supabaseSelect } from '../../../../lib/utils';

type PendingRedemptionRow = {
  id: string;
  customer_id: string;
  event_id: string;
  reward_id: string;
  points_cost: number;
  status: 'pending' | 'approved' | 'rejected';
  host_note?: string | null;
  customer_note?: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const authError = assertHostRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const scopedEventId =
    url.searchParams.get('event_id')?.trim() || request.headers.get('x-host-event-id')?.trim() || '';

  if (!scopedEventId) {
    return NextResponse.json(
      { error: 'Host queue requires event scoping. Provide event_id query or x-host-event-id header.' },
      { status: 400 },
    );
  }

  const rows = await supabaseSelect<PendingRedemptionRow>(
    'reward_redemptions',
    new URLSearchParams({
      select: 'id,customer_id,event_id,reward_id,points_cost,status,host_note,customer_note,created_at',
      status: 'eq.pending',
      event_id: `eq.${scopedEventId}`,
      order: 'created_at.asc',
    }),
  );

  return NextResponse.json({ pending: rows, scoped_event_id: scopedEventId });
}
