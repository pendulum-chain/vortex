import MOONBEAM from '../../assets/trustedby/moonbeam.svg';
import POLKADOT from '../../assets/trustedby/polkadot.svg';
import STELLAR from '../../assets/trustedby/stellar.svg';
import NABLA from '../../assets/trustedby/nabla.svg';
import WEB3 from '../../assets/trustedby/web3.svg';

import MASTERCARD from '../../assets/payments/mastercard.svg';
import SEPA from '../../assets/payments/sepa.svg';
import VISA from '../../assets/payments/visa.svg';

interface ImageProps {
  src: string;
  alt: string;
  comingSoon?: boolean;
}

const Image = ({ src, alt, comingSoon }: ImageProps) => (
  <div className="relative flex items-center pt-4">
    <img src={src} alt={alt} className="max-w-[150px] h-[48px]" />
    {comingSoon && <div className="absolute top-0 right-0 text-xs text-right text-blue-700">Coming soon</div>}
  </div>
);

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-12">
    {images.map((img) => (
      <Image key={img.alt} {...img} />
    ))}
  </div>
);

export const TrustedBy = () => {
  const trustedByImages = [
    { src: MOONBEAM, alt: 'Moonbeam logo' },
    { src: POLKADOT, alt: 'Polkadot logo' },
    { src: STELLAR, alt: 'Stellar logo' },
    { src: NABLA, alt: 'Nabla logo' },
    { src: WEB3, alt: 'Web3 Foundation logo' },
  ];

  const paymentImages = [
    { src: SEPA, alt: 'SEPA logo' },
    { src: MASTERCARD, alt: 'Mastercard logo', comingSoon: true },
    { src: VISA, alt: 'Visa logo', comingSoon: true },
  ];

  return (
    <section className="container mx-auto">
      <h1 className="mb-4 text-4xl text-center text-black">Trusted by</h1>
      <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-12">
        <ImageList images={trustedByImages} />
        <ImageList images={paymentImages} />
      </div>
    </section>
  );
};
