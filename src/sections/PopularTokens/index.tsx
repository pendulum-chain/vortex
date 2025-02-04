import { motion } from 'motion/react';
import { Networks, getNetworkDisplayName } from '../../helpers/networks';
import { useGetNetworkIcon } from '../../hooks/useGetNetworkIcon';
import { AssetIconType, useGetAssetIcon } from '../../hooks/useGetAssetIcon';
import { useEffect, useState } from 'react';

const tokens: Array<{ name: string; assetIcon: AssetIconType }> = [
  { name: 'USDC', assetIcon: 'usdc' },
  { name: 'USDC.e', assetIcon: 'usdc' },
  { name: 'USDT', assetIcon: 'usdt' },
];

const networks = Object.values(Networks);

const NetworkBadge = ({ network, isAnimating }: { network: Networks; isAnimating: boolean }) => {
  const networkIcon = useGetNetworkIcon(network);
  const scale = isAnimating ? 1.05 : 1;
  const bgColor = isAnimating ? 'bg-gray-300' : 'bg-secondary';

  return (
    <motion.li
      className={`flex items-center justify-center px-4 py-2 shadow-lg rounded-xl ${bgColor}`}
      whileHover={{
        scale: 1.05,
        rotate: [0, -1, 1, -1, 0],
        transition: {
          rotate: {
            repeat: Infinity,
            duration: 0.5,
          },
        },
      }}
      animate={{ scale }}
      transition={{ duration: 0.5 }}
    >
      <img src={networkIcon} alt={getNetworkDisplayName(network)} className="w-6 h-6 mr-2" />
      <span className="font-medium text-gray-900">{getNetworkDisplayName(network)}</span>
    </motion.li>
  );
};

const TokenBadge = ({
  token,
  isAnimating,
}: {
  token: { name: string; assetIcon: AssetIconType };
  isAnimating: boolean;
}) => {
  const icon = useGetAssetIcon(token.assetIcon);
  const scale = isAnimating ? 1.05 : 1;
  const bgColor = isAnimating ? 'bg-gray-300' : 'bg-secondary';

  return (
    <motion.li
      className={`flex items-center justify-center px-4 py-2 shadow-lg rounded-xl ${bgColor}`}
      whileHover={{
        scale: 1.05,
        rotate: [0, -1, 1, -1, 0],
        transition: {
          rotate: {
            repeat: Infinity,
            duration: 0.3,
          },
        },
      }}
      animate={{ scale }}
      transition={{ duration: 0.5 }}
    >
      <img src={icon} alt={token.name} className="w-6 h-6 mr-2" />
      <span className="font-medium text-gray-900">{token.name}</span>
    </motion.li>
  );
};

export function PopularTokens() {
  const [animatingIndex, setAnimatingIndex] = useState<{ type: 'network' | 'token'; index: number }>({
    type: 'network',
    index: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const isNetwork = Math.random() < 0.5;
      const maxIndex = isNetwork ? networks.length : tokens.length;
      const newIndex = Math.floor(Math.random() * maxIndex);

      setAnimatingIndex({
        type: isNetwork ? 'network' : 'token',
        index: newIndex,
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-2xl p-8 mx-auto text-center ">
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900">Supported Networks</h2>
        <p className="mt-2 text-lg text-gray-600">Trade across multiple blockchain networks</p>

        <ul className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {networks.map((network, index) => (
            <NetworkBadge
              key={network}
              network={network}
              isAnimating={animatingIndex.type === 'network' && index === animatingIndex.index}
            />
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Supported Tokens</h2>
        <p className="mt-2 text-lg text-gray-600">Trade these popular stablecoins</p>
        <motion.ul
          className="flex flex-wrap items-center justify-center gap-2 mt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {tokens.map((token, index) => (
            <TokenBadge
              key={index}
              token={token}
              isAnimating={animatingIndex.type === 'token' && index === animatingIndex.index}
            />
          ))}
        </motion.ul>
      </div>
    </div>
  );
}
