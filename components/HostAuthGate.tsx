'use client';

import { ReactNode, useState } from 'react';

type HostAuth = { hostKey: string; hostName: string };

export default function HostAuthGate({ children }: { children: (auth: HostAuth) => ReactNode }) {
  const [hostKey, setHostKey] = useState('');
  const [hostName, setHostName] = useState('Host');
  const [isUnlocked, setIsUnlocked] = useState(false);

  if (isUnlocked) {
    return <>{children({ hostKey, hostName: hostName.trim() || 'Host' })}</>;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <form
        className="w-full space-y-4 rounded-2xl border border-violet-300/30 bg-violet-950/30 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (hostKey.trim()) setIsUnlocked(true);
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
        <button className="w-full rounded-xl bg-violet-500/30 px-4 py-3 font-semibold">Enter Dashboard</button>
      </form>
    </div>
  );
}
