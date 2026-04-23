export default function EventStatusControl({ hostName }: { hostKey: string; hostName: string }) {
  return (
    <section className="fd-panel fd-event-status">
      <p className="fd-eyebrow">Event Status</p>
      <p>Live controls active for {hostName}.</p>
    </section>
  );
}
