export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getCustomerSessionTokenFromRequest, verifyCustomerSessionToken } from '../../../lib/customer-session';
import { SupabaseRequestError, supabaseInsert, supabaseSelect } from '../../../lib/utils';

type Body = { action?: 'facebook_follow' | 'event_share'; event_id?: string };
type LedgerRow = { id: string };

const BONUS_ENTRY_TYPE = 'bonus';

export async function POST(request: Request) {
  const token = getCustomerSessionTokenFromRequest(request);
  if (!token) return NextResponse.json({ ok: false, error: 'Missing session.' }, { status: 401 });
  const session = await verifyCustomerSessionToken(token);
  if (!session) return NextResponse.json({ ok: false, error: 'Invalid session.' }, { status: 401 });

  const body = (await request.json()) as Body;
  const action = body.action;
  if (!action) return NextResponse.json({ ok: false, error: 'Missing action.' }, { status: 400 });

  const eventId = action === 'event_share' ? (body.event_id || session.event_id || null) : null;
  const description = action === 'facebook_follow' ? 'bonus_facebook_follow' : 'bonus_event_share';

  const filters = new URLSearchParams({
    select: 'id',
    customer_id: `eq.${session.customer_id}`,
    description: `eq.${description}`,
    limit: '1',
  });
  if (action === 'event_share' && eventId) filters.set('event_id', `eq.${eventId}`);

  const existing = await supabaseSelect<LedgerRow>('points_ledger', filters);
  if (existing.length > 0) return NextResponse.json({ ok: true, awarded: false, message: 'Already claimed.' });

  try {
    await supabaseInsert('points_ledger', {
      customer_id: session.customer_id,
      venue_id: null,
      event_id: eventId,
      entry_type: BONUS_ENTRY_TYPE,
      points: action === 'facebook_follow' ? 1 : 2,
      reference_id: null,
      description,
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.code === '23505') {
      return NextResponse.json({ ok: true, awarded: false, message: 'Already claimed.' });
    }
    throw error;
  }

  return NextResponse.json({ ok: true, awarded: true });
}
