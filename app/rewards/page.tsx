import FourDogsLogo from '../../components/FourDogsLogo';
import RewardsLookup from '../../components/RewardsLookup';

export default function RewardsPage() {
  return (
    <main className="fd-checkin-page">
      <div className="fd-checkin-shell">
        <header className="fd-checkin-brand-header" aria-label="Four Dogs rewards branding">
          <div className="fd-checkin-logo-wrap">
            <FourDogsLogo />
          </div>
          <h1 className="fd-logo-title">Four Dogs Entertainment</h1>
          <div className="fd-header-rule" aria-hidden="true" />
          <p className="fd-checkin-tagline">For a Doggone Good Time</p>
        </header>

        <section className="fd-checkin-card" aria-label="Rewards lookup">
          <RewardsLookup />
        </section>
      </div>
    </main>
  );
}
