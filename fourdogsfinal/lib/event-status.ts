export type EventLifecycleStatus = 'upcoming' | 'live' | 'closed';

export type EventStatusInput = {
  status?: string | null;
  event_date?: string | null;
  starts_at?: string | Date | null;
  ends_at?: string | Date | null;
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseEventDate(eventDate: string | null | undefined): Date | null {
  if (!eventDate) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ? `${eventDate}T00:00:00.000Z`
    : eventDate;

  return toDate(normalized);
}

export function deriveEventStatus(
  event: EventStatusInput,
  now: Date = new Date(),
): EventLifecycleStatus {
  if (event.status === 'closed') return 'closed';

  const startsAt = toDate(event.starts_at);
  const endsAt = toDate(event.ends_at);

  // Prefer explicit timestamps when they exist.
  if (startsAt || endsAt) {
    if (endsAt && now >= endsAt) return 'closed';
    if (startsAt && now < startsAt) return 'upcoming';
    if (startsAt && (!endsAt || now < endsAt)) return 'live';
  }

  const eventDate = parseEventDate(event.event_date);
  if (!eventDate) return event.status === 'upcoming' ? 'upcoming' : 'live';

  const todayKey = toUtcDayKey(now);
  const eventDayKey = toUtcDayKey(eventDate);

  if (eventDayKey < todayKey) return 'closed';
  if (eventDayKey > todayKey) return 'upcoming';
  return 'live';
}

export function isEventLive(event: EventStatusInput, now: Date = new Date()): boolean {
  return deriveEventStatus(event, now) === 'live';
}
