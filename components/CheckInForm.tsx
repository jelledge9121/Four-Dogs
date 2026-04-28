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
  venue_name: string;
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
  referral_code: string | null;
  available_rewards: RewardDefinition[];
  locked_rewards: RewardDefinition[];
  next_reward: {
    target_points: number;
    points_to_unlock: number;
    reward: RewardDefinition;
  } | null;
  customer_name?: string | null;
  event_id?: string | null;
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
  const [currentStep, setCurrentStep] = useState<'event' | 'details'>('event');
  const [teamName, setTeamName] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successPayload, setSuccessPayload] = useState<CheckinSuccess | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareAwarded, setShareAwarded] = useState<string>('');
  const [reminderOptIn, setReminderOptIn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref.toUpperCase());
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetch('/api/events', { cache: 'no-store' });
        if (!response.ok) throw new Error();

        const payload = (await response.json()) as EventsResponse;
        const loadedEvents = (payload.events ?? []).map((event) => ({
          ...event,
          venue_name: event.venue_name ?? '',
        }));
        const eventId = selectDefaultEvent(loadedEvents);

        if (!isMounted) return;

        setEvents(loadedEvents);

        if (!eventId) {
          setEventsLoadError('No events are available for check-in right now.');
          return;
        }

        setSelectedEventId(eventId);
        if (loadedEvents.length === 1) {
          setCurrentStep('details');
        }
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
          referral_code: referralCode.trim() || null,
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

  function buildReferralLink(code: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/checkin?ref=${code}`;
  }

  async function handleCopyReferral(code: string) {
    try {
      await navigator.clipboard.writeText(buildReferralLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: leave as-is
    }
  }

  async function claimBonus(action: 'facebook_follow' | 'event_share') {
    const response = await fetch('/api/bonus-actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, event_id: selectedEventId }),
    });
    const payload = (await response.json()) as { awarded?: boolean; message?: string };
    setShareAwarded(payload.awarded ? 'Bonus points added!' : payload.message || 'Already claimed.');
  }

  if (status === 'success' && successPayload) {
    return (
      <div className="fd-checkin-success">
        <div className="fd-success-head">
          <p>Check-In Confirmed</p>
          <h2>You&apos;re In 🎉</h2>
          <p className="fd-checkin-info">Welcome back, {(participantName || 'friend').split(' ')[0]}.</p>
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
          <p className="fd-checkin-info">
            🎁 Bonuses:{' '}
            {successPayload.bonuses_earned
              .map((bonus) =>
                bonus === 'first_visit_bonus'
                  ? 'First Visit +2'
                  : bonus === 'referral_bonus'
                    ? 'Referral +2'
                    : bonus.startsWith('milestone')
                      ? 'Milestone +2'
                      : bonus,
              )
              .join(', ')}
          </p>
        ) : null}

        {successPayload.next_reward ? (
          <p className="fd-checkin-info">
            You&apos;re {successPayload.next_reward.points_to_unlock} points away from{' '}
            {successPayload.next_reward.reward.title}.
          </p>
        ) : null}
        <p className="fd-checkin-info">
          Tier: {successPayload.total_visits >= 25 ? 'Pack Leader' : successPayload.total_visits >= 10 ? 'Top Dog' : successPayload.total_visits >= 5 ? 'Regular' : 'Rookie'} · {Math.max(0, (successPayload.total_visits >= 25 ? 25 : successPayload.total_visits >= 10 ? 25 : successPayload.total_visits >= 5 ? 10 : 5) - successPayload.total_visits)} visits until next tier.
        </p>

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
          <p className="fd-checkin-info">Keep checking in to unlock rewards!</p>
        )}

        {successPayload.referral_code ? (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1rem',
              background: 'rgba(0,200,200,0.08)',
              border: '1px solid #00c8c8',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#00c8c8', fontWeight: 600 }}>
              🐾 Share &amp; Both Earn +2 Points
            </p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#aaa' }}>
              Share your link — when a friend checks in, you both get +2 bonus points!
            </p>
            <code
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: '#fff',
                background: 'rgba(0,0,0,0.3)',
                padding: '0.5rem',
                borderRadius: '4px',
                marginBottom: '0.75rem',
                wordBreak: 'break-all',
              }}
            >
              {buildReferralLink(successPayload.referral_code)}
            </code>
            <button
              type="button"
              onClick={() => handleCopyReferral(successPayload.referral_code!)}
              className="fd-checkin-button"
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
            >
              {copied ? '✓ Copied!' : 'Copy Referral Link'}
            </button>
          </div>
        ) : null}

        <div className="fd-rewards-copy" style={{ marginTop: '0.5rem' }}>
          <p style={{ color: '#9eeed9', fontWeight: 700 }}>Earn Bonus Points</p>
          <p>Bring your crew. Earn more rewards.</p>
          <p>Share this event or bring a first-time guest to earn bonus points.</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="fd-checkin-button" onClick={() => claimBonus('event_share')}>Claim +2 Event Share</button>
            <button type="button" className="fd-checkin-button" onClick={() => window.open('https://www.facebook.com/profile.php?id=61574086319373', '_blank')}>Follow on Facebook</button>
            <button type="button" className="fd-checkin-button" onClick={() => claimBonus('facebook_follow')}>Claim +1 Follow</button>
          </div>
          {typeof navigator !== 'undefined' && navigator.share ? <button type="button" className="fd-checkin-button" onClick={() => navigator.share({ title: selectedEvent?.title || 'Four Dogs Event', url: window.location.href })}>Native Share</button> : null}
          {shareAwarded ? <p className="fd-checkin-info">{shareAwarded}</p> : null}
          <p className="fd-checkin-info">Bring-a-Friend +5 bonus will be awarded when referred first-time guest check-in validation is enabled.</p>
        </div>

        <div className="fd-rewards-copy">
          <p style={{ color: '#9eeed9', fontWeight: 700 }}>Reminders</p>
          <label><input type="checkbox" checked={reminderOptIn} onChange={(e) => setReminderOptIn(e.target.checked)} /> Want a reminder before the next Four Dogs event?</label>
          <p className="fd-checkin-info">Reminder preference UI captured locally for now. Persistence pending schema support.</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setTeamName('');
            setParticipantName('');
            setPhone('');
            setEmail('');
            setReferralCode('');
            setErrorMessage('');
            setSuccessPayload(null);
            setCopied(false);
          }}
          className="fd-checkin-button"
          style={{ marginTop: '1rem', background: 'transparent', border: '1px solid #444', color: '#aaa' }}
        >
          Check In Another Player
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="fd-checkin-form" noValidate>
      <section className="fd-checkin-event-intro" aria-label="Choose your event">
        <p className="fd-checkin-event-kicker">For a Doggone Good Time</p>
        <h2>Choose Your Event</h2>
        <p>Select an event below to check in for trivia and music bingo nights.</p>
      </section>

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

      {events.length > 1 && currentStep === 'event' ? (
        <section className="fd-event-option-wrap" aria-label="Available events">
          <p className="fd-event-option-label">Upcoming Events</p>
          <div className="fd-event-option-list">
          {events.map((eventItem) => {
            const isSelected = eventItem.id === selectedEventId;
            const statusClass = eventItem.status === 'live' ? 'is-live' : 'is-upcoming';

            return (
              <button
                key={eventItem.id}
                type="button"
                onClick={() => {
                  setSelectedEventId(eventItem.id);
                  setCurrentStep('details');
                }}
                className={`fd-event-option-card ${isSelected ? 'is-selected' : ''}`}
                aria-pressed={isSelected}
              >
                <div className="fd-event-option-head">
                  <p>{eventItem.title ?? 'Untitled Event'}</p>
                  <span className={`fd-event-status-badge ${statusClass}`}>
                    {eventItem.status === 'live' ? 'LIVE' : 'UPCOMING'}
                  </span>
                </div>
                <p className="fd-event-option-venue">{eventItem.venue_name ?? 'Venue to be announced'}</p>
                <p className="fd-event-option-time">{formatEventSchedule(eventItem)}</p>
              </button>
            );
          })}
          </div>
        </section>
      ) : null}

      {currentStep === 'details' ? (
        <>
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

      <div className="fd-form-group">
        <label htmlFor="referral-code">Referral Code (Optional)</label>
        <input
          id="referral-code"
          type="text"
          value={referralCode}
          onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
          placeholder="Friend's code for +2 bonus points"
          className="fd-checkin-input"
        />
      </div>

      <section className="fd-rewards-copy" aria-label="Reward details">
        <p>Earn 1 point every check-in</p>
        <p>First visit bonus: +2 points</p>
        <p>Refer a friend: +2 points each</p>
        <p>Redeem points for bonus trivia points, bingo cards, appetizers, drinks, and Four Dogs gear</p>
      </section>

      {eventsLoadError ? <p className="fd-checkin-warning">{eventsLoadError}</p> : null}
      {status === 'error' ? <p className="fd-checkin-error">{errorMessage}</p> : null}

      <button type="submit" disabled={!canSubmit} className="fd-checkin-button">
        {status === 'loading' ? 'Checking In…' : 'Check In & Earn Points'}
      </button>

      <p className="fd-trust-copy">No spam. Just rewards.</p>
        </>
      ) : null}
    </form>
  );
}
