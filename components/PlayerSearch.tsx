'use client';

import { useState } from 'react';

export default function PlayerSearch() {
  const [term, setTerm] = useState('');

  return (
    <section className="rounded-2xl border border-violet-300/30 bg-violet-950/20 p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-violet-200">Player Search</p>
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search by name or phone"
        className="mt-3 w-full rounded-xl border border-violet-300/35 bg-black/30 px-3 py-3"
      />
    </section>
  );
}
