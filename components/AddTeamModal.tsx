'use client';

import { useState } from 'react';

export default function AddTeamModal() {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-xl border border-violet-300/40 bg-violet-500/15 px-4 py-2 text-xs font-semibold uppercase"
      >
        {open ? 'Close Team Modal' : 'Add Team'}
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-violet-300/30 bg-black/20 p-3 text-sm text-violet-100/80">
          Team add modal placeholder.
        </div>
      ) : null}
    </section>
  );
}
