export default function TeamCard({ title, subtitle, points }: { title: string; subtitle: string; points: number }) {
  return (
    <article className="fd-panel fd-team-card">
      <p className="fd-team-title">{title}</p>
      <p className="fd-team-subtitle">{subtitle}</p>
      <p className="fd-team-points">{points} points</p>
    </article>
  );
}
