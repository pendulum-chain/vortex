import MOONBEAM from '../../assets/trustedby/moonbeam.svg';
import POLKADOT from '../../assets/trustedby/polkadot.svg';
import STELLAR from '../../assets/trustedby/stellar.svg';
import NABLA from '../../assets/trustedby/nabla.svg';
import WEB3 from '../../assets/trustedby/web3.svg';

import MASTERCARD from '../../assets/payments/mastercard.svg';
import SEPA from '../../assets/payments/sepa.svg';
import VISA from '../../assets/payments/visa.svg';

export const TrustedBy = () => {
  const trustedByImages = [
    { id: 'moonbeam', src: MOONBEAM, alt: 'Moonbeam logo' },
    { id: 'polkadot', src: POLKADOT, alt: 'Polkadot logo' },
    { id: 'stellar', src: STELLAR, alt: 'Stellar logo' },
    { id: 'nabla', src: NABLA, alt: 'Nabla logo' },
    { id: 'web3', src: WEB3, alt: 'Web3 Foundation logo' },
  ];

  const paymentImages = [
    { id: 'sepa', src: SEPA, alt: 'SEPA logo' },
    { id: 'mastercard', src: MASTERCARD, alt: 'Mastercard logo', comingSoon: true },
    { id: 'visa', src: VISA, alt: 'Visa logo', comingSoon: true },
  ];

  const Image = ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} className="max-w-[150px] h-[48px]" />
  );

  const TrustedByList = () => (
    <>
      {trustedByImages.map((img) => (
        <Image key={img.id} src={img.src} alt={img.alt} />
      ))}
    </>
  );

  const PaymentList = () => (
    <>
      {paymentImages.map((img) => (
        <div key={img.id} className="relative flex items-center pt-4">
          <Image src={img.src} alt={img.alt} />
          {img.comingSoon && <div className="absolute top-0 right-0 text-xs text-right text-blue-700">Coming soon</div>}
        </div>
      ))}
    </>
  );

  return (
    <section className="container mx-auto">
      <h1 className="mb-4 text-4xl text-center text-black">Trusted by</h1>
      <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-12">
        <TrustedByList />
        <PaymentList />
      </div>
    </section>
  );
};
