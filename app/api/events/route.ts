import { NextResponse } from 'next/server';

import { deriveEventStatus, type EventStatusInput } from '@/lib/event-status';
import { getEventByIdFromDatabase, getEventsFromDatabase } from '@/lib/utils';

export type EventApiRow = EventStatusInput & {
  id: string;
  title?: string | null;
  venue_id?: string | null;
};

export function applyDerivedLifecycleStatus<T extends EventApiRow>(
  events: T[],
  now: Date = new Date(),
): Array<T & { status: ReturnType<typeof deriveEventStatus> }> {
  return events.map((event) => ({
    ...event,
    status: deriveEventStatus(
      {
        status: event.status,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        event_date: event.event_date,
      },
      now,
    ),
  }));
}

function withDerivedLifecycleStatus<T extends EventApiRow>(
  event: T,
  now: Date = new Date(),
): T & { status: ReturnType<typeof deriveEventStatus> } {
  return {
    ...event,
    status: deriveEventStatus(
      {
        status: event.status,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        event_date: event.event_date,
      },
      now,
    ),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const selectedEventId = searchParams.get('event_id')?.trim();

  if (selectedEventId) {
    const event = await getEventByIdFromDatabase(selectedEventId);

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    return NextResponse.json({ event: withDerivedLifecycleStatus(event) });
  }

  const events = await getEventsFromDatabase();
  return NextResponse.json({ events: applyDerivedLifecycleStatus(events) });
}
