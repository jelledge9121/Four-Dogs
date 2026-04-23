'use client';

import { useState } from 'react';

export default function AddTeamModal() {
  const [open, setOpen] = useState(false);
  return (
    <section className="fd-panel">
      <button type="button" onClick={() => setOpen((value) => !value)} className="fd-primary-button">
        {open ? 'Close Team Modal' : 'Add Team'}
      </button>
      {open ? <div className="fd-muted fd-team-modal">Team add modal placeholder.</div> : null}
    </section>
  );
}
