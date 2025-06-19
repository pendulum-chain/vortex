import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import SEPA from "../../assets/payments/sepa.svg";
import COINDESK from "../../assets/trusted-by/coindesk.svg";
import ETHEREUM from "../../assets/trusted-by/ethereum.svg";
import METAMASK from "../../assets/trusted-by/metamask.svg";
import PLUGNPLAY from "../../assets/trusted-by/plugnplay.png";
import POLKADOT from "../../assets/trusted-by/polkadot.svg";
import WEB3 from "../../assets/trusted-by/web3.svg";

const trustedByImages = [
  { alt: "Polkadot logo", src: POLKADOT },
  { alt: "Ethereum logo", src: ETHEREUM },
  { alt: "MetaMask logo", src: METAMASK },
  { alt: "Web3 Foundation logo", src: WEB3 },
  { alt: "CoinDesk logo", src: COINDESK },
  { alt: "SEPA logo", src: SEPA },
  { alt: "PlugAndPlay logo", src: PLUGNPLAY }
];

interface ImageProps {
  src: string;
  alt: string;
  comingSoon?: boolean;
}

const Image = ({ src, alt, comingSoon }: ImageProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex items-center pt-4">
      <motion.img
        alt={alt}
        className="h-[38px] max-w-[120px]"
        initial={{ opacity: 0, y: 20 }}
        src={src}
        transition={{ duration: 0.2 }}
        viewport={{ once: true }}
        whileHover={{
          rotate: [0, -1, 1, -1, 0],
          scale: 1.02,
          transition: {
            rotate: {
              duration: 0.9,
              repeat: Infinity
            }
          }
        }}
        whileInView={{ opacity: 1, y: 0 }}
      />
      {comingSoon && (
        <div className="absolute top-0 right-0 text-right text-blue-700 text-xs">{t("sections.trustedBy.comingSoon")}</div>
      )}
    </div>
  );
};

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-1">
    {images.map((img, index) => (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        key={img.alt}
        transition={{ delay: index * 0.1, duration: 0.5 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
      >
        <Image {...img} />
      </motion.div>
    ))}
  </div>
);

export const TrustedBy = () => {
  const { t } = useTranslation();

  return (
    <section className="mx-2 mt-12 mb-20 sm:container sm:mx-auto">
      <motion.h1 className="mb-5 text-center text-2xl text-black sm:text-[1.5rem]">{t("sections.trustedBy.title")}</motion.h1>
      <ImageList images={trustedByImages} />
    </section>
  );
};
