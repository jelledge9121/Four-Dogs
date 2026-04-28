'use client';

import { useEffect, useState } from 'react';

import AddTeamModal from '../../components/AddTeamModal';
import EventHeader from '../../components/EventHeader';
import EventStatusControl from '../../components/EventStatusControl';
import HostAuthGate from '../../components/HostAuthGate';
import OfflineIndicator from '../../components/OfflineIndicator';
import PendingRewards from '../../components/PendingRewards';
import PlayerSearch from '../../components/PlayerSearch';
import QRCodeDisplay from '../../components/QRCodeDisplay';
import TeamCard from '../../components/TeamCard';

type EventRow = { id: string; status?: string };

type PendingRedemption = {
  id: string;
  customer_id: string;
  event_id: string;
  reward_id: string;
  points_cost: number;
  host_note?: string | null;
  customer_note?: string | null;
  created_at: string;
};
type Analytics = {
  total_checkins: number; unique_guests: number; new_guests: number; returning_guests: number;
  repeat_rate: number; avg_checkins_per_event: number; pending_reward_redemptions: number;
  venue_proof: { checkins: number; events: number; returning_percent: number; avg_attendance_per_event: number; top_venue_name: string };
};

export default function HostPage() {
  const [pending, setPending] = useState<PendingRedemption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  return (
    <main className="fd-host-page">
      <HostAuthGate>
        {(auth) => (
          <div className="fd-host-wrap">
            <OfflineIndicator />
            <EventHeader title="Host Dashboard" subtitle="Live moderation and reward controls" />
            <EventStatusControl hostKey={auth.hostKey} hostName={auth.hostName} />

            <div className="fd-grid fd-grid-2">
              <QRCodeDisplay />
              <PlayerSearch />
            </div>

            <PendingRewards
              hostKey={auth.hostKey}
              hostName={auth.hostName}
              pending={pending}
              eventId={selectedEventId}
              onChanged={() => setRefreshTick((value) => value + 1)}
            />
            <VenueAnalyticsPanel analytics={analytics} />

            <section className="fd-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {pending.slice(0, 6).map((reward) => (
                <TeamCard
                  key={reward.id}
                  title={reward.reward_id}
                  subtitle={`Customer: ${reward.customer_id.slice(0, 8)}…`}
                  points={reward.points_cost}
                />
              ))}
            </section>

            <AddTeamModal />

            <HostRedemptionLoader
              hostKey={auth.hostKey}
              refreshTick={refreshTick}
              selectedEventId={selectedEventId}
              onEventResolved={setSelectedEventId}
              onLoaded={(rows) => setPending(rows)}
            />
            <AnalyticsLoader onLoaded={setAnalytics} refreshTick={refreshTick} />
          </div>
        )}
      </HostAuthGate>
    </main>
  );
}

function VenueAnalyticsPanel({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) return null;
  return <section className="fd-grid fd-grid-2">
    <TeamCard title="Total Check-Ins" subtitle="Across all events" points={analytics.total_checkins} />
    <TeamCard title="Unique Guests" subtitle={`New ${analytics.new_guests} · Returning ${analytics.returning_guests}`} points={analytics.unique_guests} />
    <TeamCard title="Repeat Attendance" subtitle="Returning / unique attendees" points={Math.round(analytics.repeat_rate * 100)} />
    <TeamCard title="Avg/Event" subtitle="Average check-ins per event" points={Math.round(analytics.avg_checkins_per_event * 10) / 10} />
    <TeamCard title="Pending Rewards" subtitle="Awaiting host action" points={analytics.pending_reward_redemptions} />
    <TeamCard title="Top Venue" subtitle={analytics.venue_proof.top_venue_name} points={analytics.venue_proof.returning_percent} />
  </section>;
}

function AnalyticsLoader({ onLoaded, refreshTick }: { onLoaded: (value: Analytics) => void; refreshTick: number }) {
  useEffect(() => {
    fetch('/api/host/analytics', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => onLoaded(payload as Analytics))
      .catch(() => undefined);
  }, [refreshTick, onLoaded]);
  return null;
}

function HostRedemptionLoader({
  hostKey,
  refreshTick,
  selectedEventId,
  onEventResolved,
  onLoaded,
}: {
  hostKey: string;
  refreshTick: number;
  selectedEventId: string;
  onEventResolved: (eventId: string) => void;
  onLoaded: (rows: PendingRedemption[]) => void;
}) {
  useEffect(() => {
    let isMounted = true;

    async function loadActiveEventAndPending() {
      let activeEventId = selectedEventId;

      if (!activeEventId) {
        const eventsResponse = await fetch('/api/events', { cache: 'no-store' });
        if (!eventsResponse.ok) return;
        const payload = (await eventsResponse.json()) as { events?: EventRow[] };
        const live = payload.events?.find((event) => event.status === 'live')?.id;
        const fallback = payload.events?.[0]?.id;
        activeEventId = live || fallback || '';
        if (!activeEventId) return;
        if (isMounted) onEventResolved(activeEventId);
      }

      const response = await fetch(`/api/host/redemptions?event_id=${encodeURIComponent(activeEventId)}`, {
        headers: {
          'x-host-key': hostKey,
          'x-host-event-id': activeEventId,
        },
        cache: 'no-store',
      });
      if (!response.ok) return;

      const payload = (await response.json()) as { pending?: PendingRedemption[] };
      if (!isMounted) return;
      onLoaded(payload.pending ?? []);
    }

    loadActiveEventAndPending();

    return () => {
      isMounted = false;
    };
  }, [hostKey, refreshTick, selectedEventId, onEventResolved, onLoaded]);

  return null;
}
