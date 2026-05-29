'use client';

import { useState } from 'react';

import ActionButtons from './ActionButtons';

type PendingRedemption = {
  id: string;
  reward_id: string;
  reward_slug?: string | null;
  reward_title?: string | null;
  customer_display_name?: string | null;
  points_cost: number;
  host_note?: string | null;
  customer_note?: string | null;
  created_at?: string | null;
};

function formatAge(createdAt?: string | null): string {
  if (!createdAt) return '';
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return '';

  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

export default function PendingRewards({
  hostKey,
  hostName,
  pending,
  eventId,
  onChanged,
}: {
  hostKey: string;
  hostName: string;
  pending: PendingRedemption[];
  eventId: string;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function moderate(id: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !window.confirm('Reject this pending reward redemption?')) return;

    setBusyId(id);
    setError('');
    try {
      const response = await fetch(`/api/host/redemptions/${id}/${action}`, {
        method: 'POST',
        headers: {
          'x-host-key': hostKey,
          'x-host-name': hostName,
          'x-host-event-id': eventId,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `Unable to ${action} reward.`);
      }

      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} reward.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-300/30 bg-violet-950/20 p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-violet-200">Pending Reward Queue</p>
      {error ? <p className="mt-2 rounded-md border border-rose-300/60 bg-rose-500/20 px-2 py-2 text-xs text-rose-100">{error}</p> : null}
      <div className="mt-3 space-y-3">
        {pending.length === 0 ? <p className="text-sm text-violet-100/75">No pending redemptions.</p> : null}
        {pending.map((item) => (
          <article key={item.id} className="rounded-xl border border-violet-300/25 bg-black/20 p-3">
            <p className="text-sm font-semibold text-violet-50">{item.reward_title || item.reward_id}</p>
            <p className="mt-1 text-xs text-violet-100/80">
              {item.customer_display_name || 'Rewards Member'} · Cost: {item.points_cost} points{formatAge(item.created_at) ? ` · ${formatAge(item.created_at)}` : ''}
            </p>
            {item.host_note ? (
              <p className="mt-2 rounded-md border border-amber-300/60 bg-amber-500/20 px-2 py-2 text-xs font-semibold text-amber-100">
                HOST ACTION REQUIRED: {item.host_note}
              </p>
            ) : null}
            {item.customer_note ? (
              <p className="mt-2 rounded-md border border-cyan-300/45 bg-cyan-500/10 px-2 py-2 text-xs text-cyan-100">
                CUSTOMER MESSAGE: {item.customer_note}
              </p>
            ) : null}
            <ActionButtons
              busy={busyId === item.id}
              onApprove={async () => moderate(item.id, 'approve')}
              onReject={async () => moderate(item.id, 'reject')}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
