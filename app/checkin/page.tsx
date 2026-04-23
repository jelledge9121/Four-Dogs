import CheckInForm from '../../components/CheckInForm';
import FourDogsLogo from '../../components/FourDogsLogo';

export default function CheckInPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f1640_0%,_#100d22_48%,_#08070f_100%)] px-4 py-6 text-violet-50">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5">
        <div className="w-full max-w-56">
          <FourDogsLogo />
        </div>

        <header className="w-full text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-violet-200">Four Dogs Entertainment</p>
          <h1 className="mt-2 text-4xl font-black uppercase tracking-[0.08em]">Check In</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm text-violet-100/85">
            Join tonight&apos;s game in seconds and start earning rewards.
          </p>
        </header>

        <section className="w-full rounded-2xl border border-violet-300/30 bg-violet-950/40 p-4 shadow-[0_16px_32px_rgba(4,4,12,0.45)]">
          <CheckInForm />
        </section>
      </div>
    </main>
  );
}
