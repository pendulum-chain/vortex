import { useTranslation } from "react-i18next";
import vortexLogo from "../../assets/logo/blue.svg";
import bank from "../../assets/payments/bank.svg";
import MASTERCARD from "../../assets/payments/mastercard.svg";
import SEPA from "../../assets/payments/sepa.svg";
import VISA from "../../assets/payments/visa.svg";
import { cn } from "../../helpers/cn";

interface ImageProps {
  src: string;
  alt: string;
  additionalClass?: string;
  comingSoon?: boolean;
}

const paymentImages = [
  { src: bank, alt: "Bank", additionalClass: "!h-5" },
  { src: SEPA, alt: "SEPA logo", additionalClass: "!h-4" },
  { src: MASTERCARD, alt: "Mastercard logo", comingSoon: true },
  { src: VISA, alt: "Visa logo", comingSoon: true }
];

const Image = ({ src, alt, comingSoon, additionalClass }: ImageProps) => (
  <div className="items-normal flex flex-col text-center">
    <img src={src} alt={alt} className={cn(comingSoon ? "h-[12px]" : "h-4", additionalClass)} />
    {comingSoon && <div className="w-12 text-[7px] text-blue-700">Coming soon</div>}
  </div>
);

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="items-normal flex flex-wrap items-center justify-center gap-x-4">
    {images.map(img => (
      <Image key={img.alt} {...img} />
    ))}
  </div>
);

export function PoweredBy() {
  const { t } = useTranslation();

  return (
    <section className="my-2 flex flex-col justify-between gap-y-2.5">
      <ImageList images={paymentImages} />
      <div className="flex items-center justify-center">
        <p className="mr-1 text-gray-500 text-xs">{t("components.footer.poweredBy")}</p>
        <a
          href="https://www.vortexfinance.co"
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:opacity-80"
        >
          <Image src={vortexLogo} alt="Vortex" additionalClass="!h-3" />
        </a>
      </div>
    </section>
  );
}
