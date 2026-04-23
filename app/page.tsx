'use client';

import { useEffect, useMemo, useState } from 'react';

import styles from './page.module.css';

type EventItem = {
  id: string;
  title: string;
  venue?: string;
  status?: string;
  eventDate?: string;
};

type EventsResponse = {
  events?: Array<{
    id?: string;
    title?: string | null;
    venue_id?: string | null;
    status?: string | null;
    event_date?: string | null;
  }>;
};

const fallbackEvents: EventItem[] = [
  {
    id: 'sitcom-trivia',
    title: 'Sitcom Trivia',
    venue: 'Four Dogs Entertainment',
  },
  {
    id: 'music-bingo-charter-803',
    title: 'Music Bingo',
    venue: 'Charter 803',
  },
  {
    id: 'trivia-night',
    title: 'Trivia',
    venue: 'Four Dogs Entertainment',
  },
];

function normalizeEvents(payload: EventsResponse | null): EventItem[] {
  if (!payload?.events?.length) {
    return fallbackEvents;
  }

  const normalized = payload.events
    .filter((event): event is NonNullable<EventsResponse['events']>[number] => Boolean(event?.id))
    .map((event) => ({
      id: event.id as string,
      title: (event.title?.trim() || 'Untitled Event') as string,
      venue: event.venue_id?.trim() || 'Four Dogs Entertainment',
      status: event.status?.trim() || undefined,
      eventDate: event.event_date?.trim() || undefined,
    }));

  return normalized.length > 0 ? normalized : fallbackEvents;
}

export default function Page() {
  const [events, setEvents] = useState<EventItem[]>(fallbackEvents);
  const [selectedId, setSelectedId] = useState<string>(fallbackEvents[0].id);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetch('/api/events', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Events request failed: ${response.status}`);
        }

        const payload = (await response.json()) as EventsResponse;
        if (!isMounted) return;

        const nextEvents = normalizeEvents(payload);
        setEvents(nextEvents);
        setSelectedId(nextEvents[0]?.id ?? fallbackEvents[0].id);
      } catch {
        if (!isMounted) return;
        setEvents(fallbackEvents);
        setSelectedId(fallbackEvents[0].id);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? events[0],
    [events, selectedId],
  );

  return (
    <main className={styles.page}>
      <section className={styles.heroCard}>
        <p className={styles.brand}>Four Dogs Entertainment</p>
        <h1 className={styles.tagline}>For a Doggone Good Time</h1>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Choose Your Event</h2>
        <p className={styles.sectionSubtitle}>
          Pick tonight&apos;s game and get ready for a polished, mobile-first check-in flow.
        </p>

        <div className={styles.grid}>
          {events.map((event) => {
            const isSelected = event.id === selectedId;

            return (
              <button
                key={event.id}
                type="button"
                className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                onClick={() => setSelectedId(event.id)}
              >
                <span className={styles.cardTitle}>{event.title}</span>
                <span className={styles.cardMeta}>{event.venue}</span>
                {event.status ? <span className={styles.status}>{event.status}</span> : null}
              </button>
            );
          })}
        </div>

        <div className={styles.selectionPanel}>
          <p className={styles.selectionLabel}>Selected Event</p>
          <p className={styles.selectionName}>{selectedEvent?.title ?? 'Event'}</p>
          <p className={styles.selectionMeta}>{selectedEvent?.venue ?? 'Four Dogs Entertainment'}</p>
          {isLoading ? <p className={styles.loading}>Refreshing event lineup…</p> : null}
        </div>
      </section>
    </main>
  );
}
