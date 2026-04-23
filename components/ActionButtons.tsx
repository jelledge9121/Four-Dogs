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
    <div className="fd-action-buttons">
      <button type="button" disabled={busy} onClick={() => void onApprove()} className="fd-approve-button">
        Approve
      </button>
      <button type="button" disabled={busy} onClick={() => void onReject()} className="fd-reject-button">
        Reject
      </button>
    </div>
  );
}
