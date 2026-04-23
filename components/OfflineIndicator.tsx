'use client';

import { useEffect, useState } from 'react';

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return <div className="rounded-xl border border-amber-300/50 bg-amber-500/15 px-3 py-2 text-sm">Offline mode detected.</div>;
}
