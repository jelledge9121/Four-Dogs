import CheckInForm from '../../components/CheckInForm';
import FourDogsLogo from '../../components/FourDogsLogo';

export default function CheckInPage() {
  return (
    <main className="fd-checkin-page">
      <div className="fd-checkin-shell">
        <header className="fd-checkin-hero" aria-label="Four Dogs check-in branding">
          <div className="fd-checkin-logo-wrap">
            <FourDogsLogo />
          </div>
        </header>

        <section className="fd-checkin-card" aria-label="Check-in form">
          <CheckInForm />
        </section>
      </div>
    </main>
  );
}
