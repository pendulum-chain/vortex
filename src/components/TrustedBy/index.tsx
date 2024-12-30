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
    <div className="flex items-center justify-center gap-12">
      {trustedByImages.map((img) => (
        <Image key={img.id} src={img.src} alt={img.alt} />
      ))}
    </div>
  );

  const PaymentList = () => (
    <div className="flex items-center justify-center gap-12">
      {paymentImages.map((img) => (
        <div key={img.id} className="flex items-center">
          <Image src={img.src} alt={img.alt} />
          {img.comingSoon && <div className="text-xs text-right text-blue-700">Coming soon</div>}
        </div>
      ))}
    </div>
  );

  return (
    <section className="container mx-auto">
      <h1 className="mb-4 text-4xl text-center text-black">Trusted by</h1>
      <div className="grid grid-rows-2 gap-4">
        <TrustedByList />
        <PaymentList />
      </div>
    </section>
  );
};
