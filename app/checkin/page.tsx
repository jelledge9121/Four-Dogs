import CheckInForm from '../../components/CheckInForm';
import FourDogsLogo from '../../components/FourDogsLogo';

export default function CheckInPage() {
  return (
    <main className="fd-checkin-page">
      <div className="fd-checkin-shell">
        <FourDogsLogo />

        <header className="fd-checkin-header">
          <p>Four Dogs Entertainment</p>
          <h1>Check In</h1>
          <p>Join tonight&apos;s game in seconds and start earning rewards.</p>
        </header>

        <section className="fd-checkin-card">
          <CheckInForm />
        </section>
      </div>
    </main>
  );
}
