import MASTERCARD from '../../assets/payments/mastercard.svg';
import bank from '../../assets/payments/bank.svg';
import VISA from '../../assets/payments/visa.svg';
import vortexLogo from '../../assets/logo/blue.svg';
import SEPA from '../../assets/payments/sepa.svg';

interface ImageProps {
  src: string;
  alt: string;
  additionalClass?: string;
  comingSoon?: boolean;
}

const paymentImages = [
  { src: bank, alt: 'Bank', additionalClass: '!h-5' },
  { src: SEPA, alt: 'SEPA logo', additionalClass: '!h-4' },
  { src: MASTERCARD, alt: 'Mastercard logo', comingSoon: true },
  { src: VISA, alt: 'Visa logo', comingSoon: true },
];

const Image = ({ src, alt, comingSoon, additionalClass }: ImageProps) => (
  <div className="flex flex-col items-normal text-center">
    <img src={src} alt={alt} className={`${comingSoon ? 'h-[12px]' : 'h-4'} ${additionalClass}`} />
    {comingSoon && <div className="text-[7px] w-12 text-blue-700">Coming soon</div>}
  </div>
);

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="flex flex-wrap justify-center items-center items-normal gap-x-4">
    {images.map((img) => (
      <Image key={img.alt} {...img} />
    ))}
  </div>
);

export function PoweredBy() {
  return (
    <section className="flex flex-col justify-between gap-y-2.5 my-2">
      <ImageList images={paymentImages} />
      <div className="flex items-center justify-center">
        <p className="mr-1 text-xs text-gray-500">Powered by</p>
        <Image src={vortexLogo} alt="Satoshipay" additionalClass="!h-3" />
      </div>
    </section>
  );
}
