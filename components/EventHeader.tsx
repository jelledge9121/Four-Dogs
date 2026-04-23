export default function EventHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="fd-panel fd-event-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  );
}
