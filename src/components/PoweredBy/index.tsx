import satoshipayLogo from '../../assets/logo/satoshipay.svg';
import MASTERCARD from '../../assets/payments/mastercard.svg';
import SEPA from '../../assets/payments/sepa.svg';
import VISA from '../../assets/payments/visa.svg';
import vortexLogo from '../../assets/logo/blue.svg';
interface ImageProps {
  src: string;
  alt: string;
  comingSoon?: boolean;
}

const paymentImages = [
  { src: SEPA, alt: 'SEPA logo' },
  { src: MASTERCARD, alt: 'Mastercard logo', comingSoon: true },
  { src: VISA, alt: 'Visa logo', comingSoon: true },
];

const Image = ({ src, alt, comingSoon }: ImageProps) => (
  <div className="relative flex items-center">
    <img src={src} alt={alt} className="h-[18px]" />
    {/* {comingSoon && <div className="absolute top-0 right-0 text-xs text-right text-blue-700">Coming soon</div>} */}
  </div>
);

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="flex flex-wrap items-center justify-center gap-x-2">
    {images.map((img) => (
      <Image key={img.alt} {...img} />
    ))}
  </div>
);

export function PoweredBy() {
  return (
    <section>
      <ImageList images={paymentImages} />
      <div className="flex items-center justify-center mt-2">
        <p className="mr-1 text-sm text-gray-500">Powered by</p>
        <Image src={vortexLogo} alt="Satoshipay" />
      </div>
      <p className="flex items-center justify-center mr-1 text-sm text-gray-500">
        A
        <a
          href="https://satoshipay.io"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:opacity-80"
        >
          <img src={satoshipayLogo} alt="Satoshipay" />
        </a>
        Company
      </p>
    </section>
  );
}
