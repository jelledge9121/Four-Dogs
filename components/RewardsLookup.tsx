'use client';

import { useEffect, useState } from 'react';

type RewardCatalogItem = {
  id: string;
  name: string;
  description: string;
  points_cost: number;
};

type CustomerRewards = {
  ok: boolean;
  customer_id: string;
  full_name: string;
  points_balance: number;
  visits: number;
  venue_name: string;
  available: RewardCatalogItem[];
  locked: RewardCatalogItem[];
};

type RedeemStatus = 'idle' | 'loading' | 'success' | 'error';

// Pick a badge emoji from the reward name/description (no schema change needed).
function rewardEmoji(item: RewardCatalogItem): string {
  const text = `${item.name} ${item.description}`.toLowerCase();
  if (/trivia|quiz|question/.test(text)) return '🎯';
  if (/bingo|card/.test(text)) return '🎱';
  if (/beer|drink|cocktail|soda|draft|pint/.test(text)) return '🍺';
  if (/app|nacho|wing|fries|food|plate|snack|chip/.test(text)) return '🍤';
  if (/shirt|tee|gear|merch|hat|hoodie|swag|sticker/.test(text)) return '👕';
  return '🏆';
}

export default function RewardsLookup() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rewards, setRewards] = useState<CustomerRewards | null>(null);
  const [redeemStatus, setRedeemStatus] = useState<Record<string, RedeemStatus>>({});
  const [redeemMessage, setRedeemMessage] = useState<Record<string, string>>({});

  async function handleLookup() {
    setLoading(true);
    setError('');
    setRewards(null);

    try {
      const res = await fetch('/api/customer-rewards', { cache: 'no-store' });
      const data = (await res.json()) as CustomerRewards & { error?: string };

      if (!res.ok || !data.ok) {
        setError(data.error || 'No active check-in found.');
        return;
      }

      setRewards(data);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleLookup();
  }, []);

  async function handleRedeem(item: RewardCatalogItem) {
    if (!rewards) return;

    setRedeemStatus((prev) => ({ ...prev, [item.id]: 'loading' }));
    setRedeemMessage((prev) => ({ ...prev, [item.id]: '' }));

    try {
      const res = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer_id: rewards.customer_id,
          reward_catalog_id: item.id,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setRedeemStatus((prev) => ({ ...prev, [item.id]: 'error' }));
        setRedeemMessage((prev) => ({ ...prev, [item.id]: data.error || 'Redemption failed.' }));
        return;
      }

      setRedeemStatus((prev) => ({ ...prev, [item.id]: 'success' }));
      setRedeemMessage((prev) => ({
        ...prev,
        [item.id]: 'Request submitted! Show this to your host to redeem.',
      }));

      const updated = await fetch('/api/customer-rewards', { cache: 'no-store' });
      const updatedData = (await updated.json()) as CustomerRewards;
      if (updated.ok && updatedData.ok) setRewards(updatedData);
    } catch {
      setRedeemStatus((prev) => ({ ...prev, [item.id]: 'error' }));
      setRedeemMessage((prev) => ({ ...prev, [item.id]: 'Something went wrong.' }));
    }
  }

  // ----- Active session: balance + rewards -----
  if (rewards) {
    return (
      <div className="fd-checkin-form">
        <div className="fd-checkin-event-block">
          <p className="fd-checkin-event-label">Your Rewards Balance</p>
          <h2 style={{ margin: '0.25rem 0' }}>{rewards.full_name}</h2>
          <p className="fd-checkin-event-venue">{rewards.venue_name}</p>
        </div>

        <div className="fd-success-stats">
          <div className="fd-success-stat">
            <p>Points</p>
            <strong>{rewards.points_balance}</strong>
          </div>
          <div className="fd-success-stat">
            <p>Visits</p>
            <strong>{rewards.visits}</strong>
          </div>
        </div>

        {rewards.available.length > 0 && (
          <section className="fd-reward-section">
            <p className="fd-success-label">🎉 Available to Redeem</p>
            <ul className="fd-reward-list">
              {rewards.available.map((item) => {
                const state = redeemStatus[item.id];
                return (
                  <li key={item.id} className="fd-reward-card is-available">
                    <div className="fd-reward-row">
                      <span className="fd-reward-icon" aria-hidden="true">{rewardEmoji(item)}</span>
                      <div className="fd-reward-body">
                        <p className="fd-reward-name">{item.name}</p>
                        {item.description ? <p className="fd-reward-desc">{item.description}</p> : null}
                        <p className="fd-reward-cost">{item.points_cost} pts</p>
                      </div>
                      <div className="fd-reward-redeem">
                        <button
                          type="button"
                          onClick={() => handleRedeem(item)}
                          disabled={state === 'loading' || state === 'success'}
                          className={`fd-redeem-button ${state === 'success' ? 'is-done' : ''}`}
                        >
                          {state === 'loading' ? '…' : state === 'success' ? '✓ Done' : 'Redeem'}
                        </button>
                      </div>
                    </div>
                    {redeemMessage[item.id] ? (
                      <p className={`fd-reward-msg ${state === 'success' ? 'is-success' : 'is-error'}`}>
                        {redeemMessage[item.id]}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {rewards.locked.length > 0 && (
          <section className="fd-reward-section">
            <p className="fd-success-label" style={{ color: 'var(--fd-muted)' }}>🔒 Keep Earning</p>
            <ul className="fd-reward-list">
              {rewards.locked.map((item) => (
                <li key={item.id} className="fd-reward-card is-locked">
                  <div className="fd-reward-row">
                    <span className="fd-reward-icon" aria-hidden="true">{rewardEmoji(item)}</span>
                    <div className="fd-reward-body">
                      <p className="fd-reward-name">{item.name}</p>
                      {item.description ? <p className="fd-reward-desc">{item.description}</p> : null}
                      <p className="fd-reward-cost">
                        {item.points_cost} pts · you have {rewards.points_balance}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rewards.available.length === 0 && rewards.locked.length === 0 && (
          <p className="fd-checkin-info">Keep checking in to earn rewards!</p>
        )}

        <button
          type="button"
          onClick={() => {
            setRewards(null);
            setRedeemStatus({});
            setRedeemMessage({});
          }}
          className="fd-secondary-button"
        >
          Look Up Another Number
        </button>
      </div>
    );
  }

  // ----- Loading (first paint, before we know session state) -----
  if (loading) {
    return (
      <div className="fd-empty-state">
        <span className="fd-empty-icon" aria-hidden="true">🐾</span>
        <p>Loading your rewards…</p>
      </div>
    );
  }

  // ----- No active session: clean empty state -----
  return (
    <div className="fd-empty-state">
      <span className="fd-empty-icon" aria-hidden="true">🎁</span>
      <h2>Check in to see your rewards</h2>
      <p>Your points, visits, and rewards show up here once you&apos;ve checked in at tonight&apos;s event.</p>

      <div className="fd-empty-actions">
        <a href="/checkin" className="fd-primary-button">Go to Check-In</a>
        <button type="button" onClick={handleLookup} disabled={loading} className="fd-secondary-button">
          {loading ? 'Checking…' : 'Already Checked In — Refresh'}
        </button>
      </div>
    </div>
  );
}
