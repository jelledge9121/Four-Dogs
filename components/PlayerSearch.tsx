'use client';

import { useState } from 'react';

export default function PlayerSearch() {
  const [term, setTerm] = useState('');

  return (
    <section className="fd-panel fd-player-search">
      <p className="fd-eyebrow">Player Search</p>
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search by name or phone"
        className="fd-host-input"
      />
    </section>
  );
}
