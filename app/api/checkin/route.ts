import { NextResponse } from 'next/server';

import { createCustomerSessionToken } from '../../../lib/customer-session';
import { deriveEventStatus } from '../../../lib/event-status';
import { getEventByIdFromDatabase } from '../../../lib/utils';

type CheckinRequestBody = {
  customer_id?: string | null;
  event_id?: string | null;
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function buildSessionCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === 'production';

  return [
    `customer_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(isProduction ? ['Secure'] : []),
  ].join('; ');
}

export async function POST(request: Request) {
  let body: CheckinRequestBody;

  try {
    body = (await request.json()) as CheckinRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const customerId = body.customer_id?.trim() || '';
  const eventId = body.event_id?.trim() || '';

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id.' }, { status: 400 });
  }

  const dbEvent = await getEventByIdFromDatabase(eventId);

  if (!dbEvent) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const status = deriveEventStatus({
    status: dbEvent.status,
    event_date: dbEvent.event_date,
    starts_at: dbEvent.starts_at,
    ends_at: dbEvent.ends_at,
  });

  if (status !== 'live') {
    return NextResponse.json(
      {
        error: 'Check-in is only allowed while an event is live.',
        status,
      },
      { status: 409 },
    );
  }

  if (!customerId) {
    return NextResponse.json(
      {
        ok: true,
        status,
        warning: 'Missing customer_id; session token not issued.',
      },
      { status: 200 },
    );
  }

  const sessionToken = await createCustomerSessionToken(customerId, eventId);

  const response = NextResponse.json({
    ok: true,
    status,
    expires_in_seconds: SESSION_MAX_AGE_SECONDS,
  });

  response.headers.append('Set-Cookie', buildSessionCookie(sessionToken));

  return response;
}
