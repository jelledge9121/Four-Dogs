export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

import { SupabaseRequestError, getEventByIdFromDatabase, getEventsFromDatabase } from '../../../lib/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const selectedEventId = searchParams.get('event_id')?.trim();

  try {
    if (selectedEventId) {
      const event = await getEventByIdFromDatabase(selectedEventId);

      if (!event) {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
      }

      return NextResponse.json({ event });
    }

    const events = await getEventsFromDatabase();

    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof SupabaseRequestError) {
      return NextResponse.json(
        {
          events: [],
          error: {
            message: error.message ?? '',
            details: error.details ?? null,
            hint: error.hint ?? null,
            code: error.code ?? null,
          },
        },
        { status: error.status || 500 },
      );
    }

    return NextResponse.json(
      {
        events: [],
        error: {
          message: error instanceof Error ? error.message : String(error),
          details: null,
          hint: null,
          code: null,
        },
      },
      { status: 500 },
    );
  }
}
