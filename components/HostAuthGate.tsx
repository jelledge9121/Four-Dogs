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
    <div className="fd-host-page fd-host-auth-wrap">
      <form
        className="fd-panel fd-host-auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (hostKey.trim()) setIsUnlocked(true);
        }}
      >
        <h1>Host Access</h1>
        <input
          className="fd-host-input"
          placeholder="Host name"
          value={hostName}
          onChange={(event) => setHostName(event.target.value)}
        />
        <input
          className="fd-host-input"
          placeholder="Host key"
          value={hostKey}
          onChange={(event) => setHostKey(event.target.value)}
          type="password"
          required
        />
        <button className="fd-primary-button">Enter Dashboard</button>
      </form>
    </div>
  );
}
