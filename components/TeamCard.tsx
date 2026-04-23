export default function TeamCard({ title, subtitle, points }: { title: string; subtitle: string; points: number }) {
  return (
    <article className="rounded-xl border border-violet-300/25 bg-violet-950/25 p-3">
      <p className="text-sm font-semibold text-violet-50">{title}</p>
      <p className="mt-1 text-xs text-violet-200/80">{subtitle}</p>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-100">{points} points</p>
    </article>
  );
}
