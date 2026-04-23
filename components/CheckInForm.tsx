'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { RewardDefinition } from '../lib/rewards';

type EventRow = {
  id?: string;
  title?: string | null;
  status?: string | null;
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
  const liveEvent = events.find((event) => event.status === 'live' && event.id);
  if (liveEvent?.id) return liveEvent.id;

  const firstEvent = events.find((event) => event.id);
  return firstEvent?.id ?? '';
}

export default function CheckInForm() {
  const [teamName, setTeamName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);

  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successPayload, setSuccessPayload] = useState<CheckinSuccess | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      try {
        const response = await fetch('/api/events', { cache: 'no-store' });
        if (!response.ok) throw new Error();

        const payload = (await response.json()) as EventsResponse;
        const eventId = selectDefaultEvent(payload.events ?? []);
        if (!isMounted) return;

        if (!eventId) {
          setEventsLoadError('No active event available for check-in right now.');
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

  const canSubmit = useMemo(
    () =>
      status !== 'loading' &&
      teamName.trim().length > 0 &&
      playerName.trim().length > 0 &&
      phone.trim().length > 0 &&
      selectedEventId.length > 0 &&
      !eventsLoadError,
    [status, teamName, playerName, phone, selectedEventId, eventsLoadError],
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
          name: playerName.trim(),
          email: email.trim() || null,
          team_name: teamName.trim(),
        }),
      });

      const payload = (await response.json()) as CheckinSuccess & { error?: string };

      if (!response.ok) throw new Error(payload.error ?? 'Check-in failed. Please try again.');

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
          <p>Check-In Complete</p>
          <h2>You&apos;re In</h2>
        </div>

        <div className="fd-success-stats">
          <div className="fd-success-stat">
            <p>Earned</p>
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
            Bonus: {successPayload.bonuses_earned.join(', ')}
          </p>
        ) : null}

        {successPayload.next_reward ? (
          <p className="fd-checkin-info">
            Next reward: {successPayload.next_reward.reward.title} at {successPayload.next_reward.target_points} points
            ({successPayload.next_reward.points_to_unlock} to go)
          </p>
        ) : null}

        {successPayload.available_rewards.length > 0 ? (
          <div>
            <p className="fd-success-label">Available Rewards</p>
            <ul className="fd-success-list">
              {successPayload.available_rewards.map((reward) => (
                <li key={reward.id}>
                  {reward.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setTeamName('');
            setPlayerName('');
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
      <div className="fd-form-group">
        <label htmlFor="team-name">Team Name</label>
        <input
          id="team-name"
          type="text"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="The Late Arrivals"
          className="fd-checkin-input"
          required
        />
      </div>

      <div className="fd-form-group">
        <label htmlFor="player-name">Player Name</label>
        <input
          id="player-name"
          type="text"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Your Name"
          className="fd-checkin-input"
          required
        />
      </div>

      <div className="fd-form-group">
        <label htmlFor="phone">Phone Number</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="(555) 555-5555"
          className="fd-checkin-input"
          required
        />
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

      {eventsLoadError ? <p className="fd-checkin-warning">{eventsLoadError}</p> : null}
      {status === 'error' ? <p className="fd-checkin-error">{errorMessage}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="fd-checkin-button"
      >
        {status === 'loading' ? 'Checking In…' : 'Check In'}
      </button>
    </form>
  );
}
