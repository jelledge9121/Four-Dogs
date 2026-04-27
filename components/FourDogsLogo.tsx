import Image from 'next/image';

export default function FourDogsLogo() {
  return (
    <div className="fd-logo" aria-label="Four Dogs Entertainment">
      <Image
        src="/four-dogs-logo.png"
        alt="Four Dogs Entertainment"
        width={168}
        height={168}
        priority
      />
    </div>
  );
}
