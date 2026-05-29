'use client';

import { ReactNode, useState } from 'react';

type HostAuth = { hostKey: string; hostName: string };

type VerifyResponse = {
  ok?: boolean;
  error?: string;
};

export default function HostAuthGate({ children }: { children: (auth: HostAuth) => ReactNode }) {
  const [hostKey, setHostKey] = useState('');
  const [hostName, setHostName] = useState('Host');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  if (isUnlocked) {
    return <>{children({ hostKey, hostName: hostName.trim() || 'Host' })}</>;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <form
        className="w-full space-y-4 rounded-2xl border border-violet-300/30 bg-violet-950/30 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!hostKey.trim() || isVerifying) return;

          setError('');
          setIsVerifying(true);
          try {
            const response = await fetch('/api/host/auth/verify', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ host_key: hostKey }),
            });

            const payload = (await response.json()) as VerifyResponse;
            if (!response.ok || !payload.ok) {
              setIsUnlocked(false);
              setError(payload.error || 'Invalid host key.');
              return;
            }

            setIsUnlocked(true);
          } catch {
            setIsUnlocked(false);
            setError('Unable to verify host access right now. Please try again.');
          } finally {
            setIsVerifying(false);
          }
        }}
      >
        <h1 className="text-xl font-bold uppercase tracking-[0.08em]">Host Access</h1>
        <input
          className="w-full rounded-xl border border-violet-300/40 bg-black/30 px-3 py-3"
          placeholder="Host name"
          value={hostName}
          onChange={(event) => setHostName(event.target.value)}
        />
        <input
          className="w-full rounded-xl border border-violet-300/40 bg-black/30 px-3 py-3"
          placeholder="Host key"
          value={hostKey}
          onChange={(event) => setHostKey(event.target.value)}
          type="password"
          required
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button className="w-full rounded-xl bg-violet-500/30 px-4 py-3 font-semibold" disabled={isVerifying}>
          {isVerifying ? 'Verifying...' : 'Enter Dashboard'}
        </button>
      </form>
    </div>
  );
}
