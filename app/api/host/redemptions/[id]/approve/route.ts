export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import { assertHostRequest } from '../../../../../../lib/host-auth';
import { supabaseRpc, supabaseSelect } from '../../../../../../lib/utils';

type ApprovalResult = {
  ok: boolean;
  status: string;
  points_deducted?: number;
};

type RedemptionScope = { id: string };

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

  const scoped = await supabaseSelect<RedemptionScope>(
    'reward_redemptions',
    new URLSearchParams({ id: `eq.${redemptionId}`, event_id: `eq.${scopedEventId}`, select: 'id', limit: '1' }),
  );
  if (scoped.length === 0) {
    return NextResponse.json({ error: 'Redemption not found in current host event scope.' }, { status: 404 });
  }

  const approvedBy = request.headers.get('x-host-name')?.trim() || 'host';

  const result = await supabaseRpc<ApprovalResult>('approve_reward_redemption', {
    p_redemption_id: redemptionId,
    p_approved_by: approvedBy,
  });

  if (!result?.ok) {
    return NextResponse.json({ error: 'Unable to approve redemption.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: result.status, points_deducted: result.points_deducted ?? 0 });
}
