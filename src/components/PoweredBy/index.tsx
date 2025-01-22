import satoshipayLogo from '../../assets/logo/satoshipay.svg';
import MASTERCARD from '../../assets/payments/mastercard.svg';
import SEPA from '../../assets/payments/sepa.svg';
import VISA from '../../assets/payments/visa.svg';
import vortexLogo from '../../assets/logo/blue.svg';
interface ImageProps {
  src: string;
  alt: string;
  additionalClass?: string;
  comingSoon?: boolean;
}

const paymentImages = [
  { src: SEPA, alt: 'SEPA logo', additionalClass: 'h-6' },
  { src: MASTERCARD, alt: 'Mastercard logo', comingSoon: true },
  { src: VISA, alt: 'Visa logo', comingSoon: true },
];

const Image = ({ src, alt, comingSoon, additionalClass }: ImageProps) => (
  <div className="relative">
    <img src={src} alt={alt} className={`h-[18px] ${additionalClass}`} />
    {comingSoon && (
      <div className="absolute bottom-[-10px] right-[-8px] text-[8px] w-12 text-blue-700">Coming soon</div>
    )}
  </div>
);

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="flex flex-wrap items-start justify-center gap-x-6">
    {images.map((img) => (
      <Image key={img.alt} {...img} />
    ))}
  </div>
);

export function PoweredBy() {
  return (
    <section>
      <ImageList images={paymentImages} />
      <div className="flex items-center justify-center mt-3">
        <p className="mr-1 text-sm text-gray-500">Powered by</p>
        <Image src={vortexLogo} alt="Satoshipay" />
      </div>
      <p className="flex items-center justify-center mt-3 mr-1 text-sm text-gray-500">
        <a
          href="https://satoshipay.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-1 text-xs transition hover:opacity-80"
        >
          A <img src={satoshipayLogo} alt="Satoshipay" /> Company
        </a>
      </p>
    </section>
  );
}
