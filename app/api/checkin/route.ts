import { NextResponse } from 'next/server';

import { createCustomerSessionToken } from '@/lib/customer-session';
import { deriveEventStatus, type EventStatusInput } from '@/lib/event-status';
import { getEventByIdFromDatabase } from '@/lib/utils';

type CheckinRequestBody = {
  event?: (EventStatusInput & { id?: string | null }) | null;
  customer_id?: string | null;
  event_id?: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CheckinRequestBody;

  const customerId = body.customer_id?.trim();
  const eventId = body.event_id?.trim() ?? body.event?.id?.trim();

  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id.' }, { status: 400 });
  }

  const dbEvent = await getEventByIdFromDatabase(eventId);
  if (!dbEvent) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const status = deriveEventStatus(dbEvent);
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
    expires_in_seconds: 60 * 60 * 12,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  response.headers.append(
    'Set-Cookie',
    `customer_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12};${
      isProduction ? ' Secure;' : ''
    }`,
  );

  return response;
}
