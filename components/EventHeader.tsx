export default function EventHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="rounded-2xl border border-violet-300/30 bg-violet-950/30 p-4">
      <h1 className="text-2xl font-black uppercase tracking-[0.08em]">{title}</h1>
      <p className="mt-1 text-sm text-violet-100/80">{subtitle}</p>
    </header>
  );
}
