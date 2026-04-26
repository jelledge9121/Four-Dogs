export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';

import { SupabaseRequestError, getEventByIdFromDatabase, getEventsFromDatabase, supabaseRpc } from '../../../lib/utils';
import { deriveEventStatus } from '../../../lib/event-status';

function sortEventsByLiveThenStart<T extends { status?: string | null; starts_at?: string | null; event_date?: string | null }>(
  events: T[],
): T[] {
  return [...events].sort((a, b) => {
    const aRank = a.status === 'live' ? 0 : 1;
    const bRank = b.status === 'live' ? 0 : 1;

    if (aRank !== bRank) return aRank - bRank;

    const aTime = a.starts_at ?? (a.event_date ? `${a.event_date}T00:00:00` : '');
    const bTime = b.starts_at ?? (b.event_date ? `${b.event_date}T00:00:00` : '');

    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;

    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
}

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
    const filteredEvents = events.filter((event) => deriveEventStatus(event) !== 'closed');
    const sortedEvents = sortEventsByLiveThenStart(filteredEvents);

    return NextResponse.json(
      { events: sortedEvents },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      },
    );
  } catch (error) {
    if (error instanceof SupabaseRequestError) {
      return NextResponse.json(
        {
          events: [],
          error: {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
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
