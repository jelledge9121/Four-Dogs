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
        setError(data.error || 'Please check in first to access your rewards.');
        return;
      }

      setRewards(data);
    } catch {
      setError('Something went wrong. Please try again.');
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

  if (rewards) {
    return (
      <div className="fd-checkin-form">
        <div className="fd-checkin-event-block" style={{ marginBottom: '1.5rem' }}>
          <p className="fd-checkin-event-label">Your Rewards Balance</p>
          <h2 style={{ margin: '0.25rem 0' }}>{rewards.full_name}</h2>
          <p className="fd-checkin-event-venue">{rewards.venue_name}</p>
        </div>

        <div className="fd-success-stats" style={{ marginBottom: '1.5rem' }}>
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
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="fd-success-label" style={{ marginBottom: '0.75rem' }}>
              🎉 Available to Redeem
            </p>
            {rewards.available.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(0,200,200,0.08)',
                  border: '1px solid #00c8c8',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#fff' }}>{item.name}</strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#aaa' }}>{item.description}</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#00c8c8' }}>{item.points_cost} points</p>
                  </div>
                  <button
                    onClick={() => handleRedeem(item)}
                    disabled={redeemStatus[item.id] === 'loading' || redeemStatus[item.id] === 'success'}
                    className="fd-checkin-button"
                    style={{ marginLeft: '1rem', padding: '0.5rem 1rem', fontSize: '0.85rem', minWidth: '80px' }}
                  >
                    {redeemStatus[item.id] === 'loading'
                      ? '...'
                      : redeemStatus[item.id] === 'success'
                        ? '✓ Done'
                        : 'Redeem'}
                  </button>
                </div>
                {redeemMessage[item.id] ? (
                  <p
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.85rem',
                      color: redeemStatus[item.id] === 'success' ? '#00c8c8' : '#ff6b6b',
                    }}
                  >
                    {redeemMessage[item.id]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {rewards.locked.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <p className="fd-success-label" style={{ marginBottom: '0.75rem', color: '#666' }}>
              🔒 Keep Earning
            </p>
            {rewards.locked.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  opacity: 0.6,
                }}
              >
                <strong style={{ color: '#fff' }}>{item.name}</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#aaa' }}>{item.description}</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#666' }}>
                  {item.points_cost} points needed · you have {rewards.points_balance}
                </p>
              </div>
            ))}
          </div>
        )}

        {rewards.available.length === 0 && rewards.locked.length === 0 && (
          <p className="fd-checkin-info">Keep checking in to earn rewards!</p>
        )}

        <button
          onClick={() => {
            setRewards(null);
            setRedeemStatus({});
            setRedeemMessage({});
          }}
          className="fd-checkin-button"
          style={{ background: 'transparent', border: '1px solid #444', color: '#aaa' }}
        >
          Look Up Another Number
        </button>
      </div>
    );
  }

  return (
    <div className="fd-checkin-form">
      <section className="fd-checkin-event-block">
        <p className="fd-checkin-event-label">Check Your Rewards</p>
        <h2>See Your Points &amp; Redeem</h2>
        <p style={{ color: '#aaa', fontSize: '0.9rem', margin: '0.5rem 0 0' }}>Rewards are available only for an active check-in session.</p>
      </section>

      {error && <p className="fd-checkin-error">{error}</p>}

      <button onClick={handleLookup} disabled={loading} className="fd-checkin-button">
        {loading ? 'Loading...' : 'Refresh My Rewards'}
      </button>

      <p className="fd-trust-copy">Check in first, then return here to redeem.</p>
    </div>
  );
}
