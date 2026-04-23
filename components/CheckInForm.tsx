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
      <div className="space-y-4 rounded-2xl border border-emerald-300/40 bg-emerald-950/35 p-5">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Check-In Complete</p>
          <h2 className="mt-1 text-3xl font-black uppercase tracking-[0.08em] text-emerald-100">You&apos;re In</h2>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
          <div className="rounded-xl border border-emerald-300/30 bg-black/25 px-2 py-2">
            <p className="text-emerald-200/80">Earned</p>
            <p className="font-bold text-emerald-100">+{successPayload.points_earned}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/30 bg-black/25 px-2 py-2">
            <p className="text-emerald-200/80">Total Points</p>
            <p className="font-bold text-emerald-100">{successPayload.total_points}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/30 bg-black/25 px-2 py-2">
            <p className="text-emerald-200/80">Visits</p>
            <p className="font-bold text-emerald-100">{successPayload.total_visits}</p>
          </div>
        </div>

        {successPayload.bonuses_earned.length > 0 ? (
          <p className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
            Bonus: {successPayload.bonuses_earned.join(', ')}
          </p>
        ) : null}

        {successPayload.next_reward ? (
          <p className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
            Next reward: {successPayload.next_reward.reward.title} at {successPayload.next_reward.target_points} points
            ({successPayload.next_reward.points_to_unlock} to go)
          </p>
        ) : null}

        {successPayload.available_rewards.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">Available Rewards</p>
            <ul className="mt-2 space-y-2 text-sm">
              {successPayload.available_rewards.map((reward) => (
                <li key={reward.id} className="rounded-lg border border-emerald-300/25 bg-black/25 px-3 py-2">
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
          className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-300/50 bg-emerald-400/15 px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-emerald-100 transition hover:bg-emerald-400/25"
        >
          Check In Another Player
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="team-name" className="block text-xs font-semibold uppercase tracking-[0.12em] text-violet-200">Team Name</label>
        <input
          id="team-name"
          type="text"
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="The Late Arrivals"
          className="w-full rounded-xl border border-violet-200/30 bg-black/30 px-3 py-3 text-base text-violet-50 placeholder:text-violet-200/50 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-400/40"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="player-name" className="block text-xs font-semibold uppercase tracking-[0.12em] text-violet-200">Player Name</label>
        <input
          id="player-name"
          type="text"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Your Name"
          className="w-full rounded-xl border border-violet-200/30 bg-black/30 px-3 py-3 text-base text-violet-50 placeholder:text-violet-200/50 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-400/40"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="phone" className="block text-xs font-semibold uppercase tracking-[0.12em] text-violet-200">Phone Number</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="(555) 555-5555"
          className="w-full rounded-xl border border-violet-200/30 bg-black/30 px-3 py-3 text-base text-violet-50 placeholder:text-violet-200/50 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-400/40"
          required
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-[0.12em] text-violet-200">Email (Optional)</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-violet-200/30 bg-black/30 px-3 py-3 text-base text-violet-50 placeholder:text-violet-200/50 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-400/40"
        />
      </div>

      {eventsLoadError ? <p className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{eventsLoadError}</p> : null}
      {status === 'error' ? <p className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex w-full items-center justify-center rounded-xl border border-violet-300/50 bg-violet-400/20 px-4 py-3 text-sm font-bold uppercase tracking-[0.1em] text-violet-50 transition hover:bg-violet-400/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? 'Checking In…' : 'Check In'}
      </button>
    </form>
  );
}
