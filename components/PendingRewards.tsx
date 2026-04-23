'use client';

import { useState } from 'react';

import ActionButtons from './ActionButtons';

type PendingRedemption = {
  id: string;
  reward_id: string;
  points_cost: number;
  host_note?: string | null;
  customer_note?: string | null;
};

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

  async function moderate(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    try {
      await fetch(`/api/host/redemptions/${id}/${action}`, {
        method: 'POST',
        headers: {
          'x-host-key': hostKey,
          'x-host-name': hostName,
          'x-host-event-id': eventId,
        },
      });
    } finally {
      setBusyId(null);
      onChanged();
    }
  }

  return (
    <section className="rounded-2xl border border-violet-300/30 bg-violet-950/20 p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-violet-200">Pending Reward Queue</p>
      <div className="mt-3 space-y-3">
        {pending.length === 0 ? <p className="text-sm text-violet-100/75">No pending redemptions.</p> : null}
        {pending.map((item) => (
          <article key={item.id} className="rounded-xl border border-violet-300/25 bg-black/20 p-3">
            <p className="text-sm font-semibold text-violet-50">{item.reward_id}</p>
            <p className="mt-1 text-xs text-violet-100/80">Cost: {item.points_cost} points</p>
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
