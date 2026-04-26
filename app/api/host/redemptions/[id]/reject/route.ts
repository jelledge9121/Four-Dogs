export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import { assertHostRequest } from '../../../../../../lib/host-auth';
import { supabaseUpdate } from '../../../../../../lib/utils';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authError = assertHostRequest(request);
  if (authError) return authError;

  const { id } = await context.params;
  const redemptionId = id?.trim();

  if (!redemptionId) {
    return NextResponse.json({ error: 'Missing redemption id.' }, { status: 400 });
  }

  const scopedEventId = request.headers.get('x-host-event-id')?.trim() || '';
  if (!scopedEventId) {
    return NextResponse.json({ error: 'Missing host event scope.' }, { status: 400 });
  }

  const updated = await supabaseUpdate(
    'reward_redemptions',
    { status: 'rejected', approved_at: new Date().toISOString() },
    new URLSearchParams({
      id: `eq.${redemptionId}`,
      event_id: `eq.${scopedEventId}`,
      status: 'eq.pending',
    }),
  );

  if (updated === 0) {
    return NextResponse.json({ error: 'Redemption is no longer pending in this event scope.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: 'rejected' });
}
