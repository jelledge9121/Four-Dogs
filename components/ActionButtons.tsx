'use client';

export default function ActionButtons({
  onApprove,
  onReject,
  busy,
}: {
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onApprove()}
        className="rounded-lg border border-emerald-300/50 bg-emerald-500/20 px-3 py-2 text-xs font-semibold uppercase disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onReject()}
        className="rounded-lg border border-rose-300/50 bg-rose-500/20 px-3 py-2 text-xs font-semibold uppercase disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
