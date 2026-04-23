'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { RewardDefinition } from '../lib/rewards';

type EventRow = {
  id: string;
  title?: string | null;
  event_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: 'live' | 'upcoming' | 'closed' | string | null;
  venue_id?: string | null;
  venue_name?: string | null;
};

type EventsResponse = {
  events?: EventRow[];
};

type FormStatus = 'idle' | 'loading' | 'success' | 'error';

type CheckinSuccess = {
  points_earned: number;
  total_points: number;
  total_visits: number;
  bonuses_earned: string[];
  available_rewards: RewardDefinition[];
  locked_rewards: RewardDefinition[];
  next_reward: {
    target_points: number;
    points_to_unlock: number;
    reward: RewardDefinition;
  } | null;
};

function selectDefaultEvent(events: EventRow[]): string {
  const liveEvent = events.find((event) => event.status === 'live');
  if (liveEvent?.id) return liveEvent.id;

  const firstEvent = events.find((event) => event.id);
  return firstEvent?.id ?? '';
}

function formatEventSchedule(event: EventRow): string {
  const eventDateText = event.event_date
    ? new Date(`${event.event_date}T00:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric' })
    : '';
  const startTimeText = event.starts_at
    ? new Date(event.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const endTimeText = event.ends_at
    ? new Date(event.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  if (eventDateText && startTimeText && endTimeText) return `${eventDateText} · ${startTimeText} – ${endTimeText}`;
  if (eventDateText && startTimeText) return `${eventDateText} · Starts ${startTimeText}`;
  if (eventDateText) return eventDateText;
  if (startTimeText && endTimeText) return `${startTimeText} – ${endTimeText}`;
  if (startTimeText) return `Starts ${startTimeText}`;
  return 'Schedule will be announced at the venue.';
}

export default function CheckInForm() {
  const [teamName, setTeamName] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successPayload, setSuccessPayload] = useState<CheckinSuccess | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetch('/api/events', { cache: 'no-store' });
        if (!response.ok) throw new Error();

        const payload = (await response.json()) as EventsResponse;
        const loadedEvents = payload.events ?? [];
        const eventId = selectDefaultEvent(loadedEvents);

        if (!isMounted) return;

        setEvents(loadedEvents);

        if (!eventId) {
          setEventsLoadError('No events are available for check-in right now.');
          return;
        }

        setSelectedEventId(eventId);
        setEventsLoadError(null);
      } catch {
        if (!isMounted) return;
        setEventsLoadError('Unable to load events right now. Please try again.');
      }
    }

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const canSubmit = useMemo(
    () =>
      status !== 'loading' &&
      participantName.trim().length > 0 &&
      phone.trim().length > 0 &&
      selectedEventId.length > 0 &&
      !eventsLoadError,
    [status, participantName, phone, selectedEventId, eventsLoadError],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEventId,
          phone,
          name: participantName.trim(),
          email: email.trim() || null,
          team_name: teamName.trim(),
        }),
      });

      const raw = await response.text();
      let payload: CheckinSuccess & { error?: string } = {} as CheckinSuccess & { error?: string };
      try {
        payload = raw ? (JSON.parse(raw) as CheckinSuccess & { error?: string }) : ({} as CheckinSuccess & { error?: string });
      } catch {
        payload = {} as CheckinSuccess & { error?: string };
      }

      if (!response.ok) {
        throw new Error((payload as any).error || `Check-in failed (${response.status})`);
      }

      setSuccessPayload(payload);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Check-in failed. Please try again.');
    }
  }

  if (status === 'success' && successPayload) {
    return (
      <div className="fd-checkin-success">
        <div className="fd-success-head">
          <p>Check-In Confirmed</p>
          <h2>You&apos;re In 🎉</h2>
        </div>

        <div className="fd-success-stats">
          <div className="fd-success-stat">
            <p>+Points Earned</p>
            <strong>+{successPayload.points_earned}</strong>
          </div>
          <div className="fd-success-stat">
            <p>Total Points</p>
            <strong>{successPayload.total_points}</strong>
          </div>
          <div className="fd-success-stat">
            <p>Visits</p>
            <strong>{successPayload.total_visits}</strong>
          </div>
        </div>

        {successPayload.bonuses_earned.length > 0 ? (
          <p className="fd-checkin-info">Bonuses earned: {successPayload.bonuses_earned.join(', ')}</p>
        ) : null}

        {successPayload.next_reward ? (
          <p className="fd-checkin-info">
            You&apos;re {successPayload.next_reward.points_to_unlock} points away from your next reward
            ({successPayload.next_reward.reward.title}).
          </p>
        ) : null}

        {successPayload.available_rewards.length > 0 ? (
          <div>
            <p className="fd-success-label">Available Rewards</p>
            <ul className="fd-success-list">
              {successPayload.available_rewards.map((reward) => (
                <li key={reward.id}>{reward.title}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="fd-checkin-info">No rewards are unlocked yet—keep checking in to earn more points.</p>
        )}

        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setTeamName('');
            setParticipantName('');
            setPhone('');
            setEmail('');
            setErrorMessage('');
            setSuccessPayload(null);
          }}
          className="fd-checkin-button"
        >
          Check In Another Player
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="fd-checkin-form" noValidate>
      <section className="fd-checkin-event-block" aria-label="Selected event">
        <p className="fd-checkin-event-label">You are checking into</p>
        {selectedEvent ? (
          <>
            <h2>{selectedEvent.title ?? 'Untitled Event'}</h2>
            <p className="fd-checkin-event-venue">{selectedEvent.venue_name ?? 'Venue to be announced'}</p>
            <div className="fd-checkin-event-meta">
              <p className="fd-checkin-event-time">{formatEventSchedule(selectedEvent)}</p>
              <span className={`fd-event-status-badge ${selectedEvent.status === 'live' ? 'is-live' : 'is-upcoming'}`}>
                {selectedEvent.status === 'live' ? 'LIVE' : 'UPCOMING'}
              </span>
            </div>
          </>
        ) : (
          <p className="fd-checkin-warning">No events are available for check-in right now.</p>
        )}
      </section>

      {events.length > 1 ? (
        <div className="fd-form-group">
          <label htmlFor="event-id">Choose Event</label>
          <select
            id="event-id"
            value={selectedEventId}
            onChange={(event) => setSelectedEventId(event.target.value)}
            className="fd-checkin-input"
            required
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title ?? 'Untitled Event'} · {event.venue_name ?? 'Venue TBD'}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="fd-form-group">
        <label htmlFor="team-name">Team Name (optional)</label>
        <input
          id="team-name"
          type="text"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="The Late Arrivals"
          className="fd-checkin-input"
        />
      </div>

      <div className="fd-form-group">
        <label htmlFor="participant-name">Your Name</label>
        <input
          id="participant-name"
          type="text"
          value={participantName}
          onChange={(event) => setParticipantName(event.target.value)}
          placeholder="Your Name"
          className="fd-checkin-input"
          required
        />
      </div>

      <div className="fd-form-group">
        <label htmlFor="phone">Your Phone Number</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="(555) 555-5555"
          className="fd-checkin-input"
          required
        />
        <p className="fd-field-helper">Use the same number each time so your points stay with you.</p>
      </div>

      <div className="fd-form-group">
        <label htmlFor="email">Email (Optional)</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="fd-checkin-input"
        />
      </div>

      <section className="fd-rewards-copy" aria-label="Reward details">
        <p>Earn 1 point every check-in</p>
        <p>First visit bonus: +2 points</p>
        <p>Redeem points for bonus trivia points, bingo cards, appetizers, drinks, and Four Dogs gear</p>
      </section>

      {eventsLoadError ? <p className="fd-checkin-warning">{eventsLoadError}</p> : null}
      {status === 'error' ? <p className="fd-checkin-error">{errorMessage}</p> : null}

      <button type="submit" disabled={!canSubmit} className="fd-checkin-button">
        {status === 'loading' ? 'Checking In…' : 'Check In & Earn Points'}
      </button>

      <p className="fd-trust-copy">No spam. Just rewards.</p>
    </form>
  );
}
