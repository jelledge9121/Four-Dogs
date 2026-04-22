import { NextResponse } from 'next/server';

import { deriveEventStatus, type EventStatusInput } from '@/lib/event-status';
import { getEventsFromDatabase } from '@/lib/utils';

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
    status: deriveEventStatus(event, now),
  }));
}

export async function GET() {
  const events = await getEventsFromDatabase();
  return NextResponse.json({ events: applyDerivedLifecycleStatus(events) });
}
