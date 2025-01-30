import POLKADOT from '../../assets/trusted-by/polkadot.svg';
import WEB3 from '../../assets/trusted-by/web3.svg';
import COINDESK from '../../assets/trusted-by/coindesk.svg';
import METAMASK from '../../assets/trusted-by/metamask.svg';

import { motion } from 'framer-motion';

interface ImageProps {
  src: string;
  alt: string;
  comingSoon?: boolean;
}

const Image = ({ src, alt, comingSoon }: ImageProps) => (
  <div className="relative flex items-center pt-4">
    <motion.img
      src={src}
      alt={alt}
      className="max-w-[150px] h-[48px]"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    />
    {comingSoon && <div className="absolute top-0 right-0 text-xs text-right text-blue-700">Coming soon</div>}
  </div>
);

const ImageList = ({ images }: { images: ImageProps[] }) => (
  <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-12">
    {images.map((img, index) => (
      <motion.div
        key={img.alt}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
      >
        <Image {...img} />
      </motion.div>
    ))}
  </div>
);

export const TrustedBy = () => {
  const trustedByImages = [
    { src: POLKADOT, alt: 'Polkadot logo' },
    { src: WEB3, alt: 'Web3 Foundation logo' },
    { src: COINDESK, alt: 'CoinDesk logo' },
    { src: METAMASK, alt: 'MetaMask logo' },
  ];

  return (
    <section className="container mx-auto mt-12">
      <motion.h1 className="mb-4 text-4xl text-center text-black">Trusted by</motion.h1>
      <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-12">
        <ImageList images={trustedByImages} />
      </div>
    </section>
  );
};
