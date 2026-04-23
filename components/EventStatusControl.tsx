export default function EventStatusControl({ hostName }: { hostKey: string; hostName: string }) {
  return (
    <section className="rounded-2xl border border-violet-300/25 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-violet-200">Event Status</p>
      <p className="mt-2 text-sm text-violet-50">Live controls active for {hostName}.</p>
    </section>
  );
}
