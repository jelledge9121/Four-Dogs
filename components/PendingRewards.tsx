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
    <section className="fd-panel">
      <p className="fd-eyebrow">Pending Reward Queue</p>
      <div className="fd-pending-list">
        {pending.length === 0 ? <p className="fd-muted">No pending redemptions.</p> : null}
        {pending.map((item) => (
          <article key={item.id} className="fd-panel fd-pending-item">
            <p className="fd-team-title">{item.reward_id}</p>
            <p className="fd-team-subtitle">Cost: {item.points_cost} points</p>
            {item.host_note ? <p className="fd-note-warn">HOST ACTION REQUIRED: {item.host_note}</p> : null}
            {item.customer_note ? <p className="fd-note-info">CUSTOMER MESSAGE: {item.customer_note}</p> : null}
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
