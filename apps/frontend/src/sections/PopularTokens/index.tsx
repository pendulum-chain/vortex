import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { Networks, getNetworkDisplayName } from "@packages/shared";
import { useTranslation } from "react-i18next";

import { cn } from "../../helpers/cn";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { useGetNetworkIcon } from "../../hooks/useGetNetworkIcon";
import { useNetworkTokenCompatibility } from "../../hooks/useNetworkTokenCompatibility";

const tokens: Array<{ name: string; assetIcon: string }> = [
  { name: "USDC", assetIcon: "usdc" },
  { name: "USDC.e", assetIcon: "usdc" },
  { name: "USDT", assetIcon: "usdt" },
  { name: "BRLA", assetIcon: "brl" },
  { name: "ARS", assetIcon: "ars" },
  { name: "EURC", assetIcon: "eurc" }
];

const networks = Object.values(Networks).filter(
  network => network !== Networks.Pendulum && network !== Networks.Stellar && network !== Networks.Moonbeam
);

type BadgeProps = {
  icon: string;
  label: string;
  isAnimating: boolean;
  rotationDuration?: number;
  onClick?: () => void;
};

const Badge = ({ icon, label, isAnimating, rotationDuration = 0.5, onClick }: BadgeProps) => {
  const scale = isAnimating ? 1.05 : 1;
  const bgColor = isAnimating ? "bg-gray-300" : "bg-secondary";

  return (
    <motion.li
      className={cn(
        "flex items-center justify-center rounded-full px-4 py-2 shadow-lg",
        bgColor,
        onClick && "cursor-pointer active:scale-95 active:bg-gray-400"
      )}
      whileHover={{
        scale: 1.05,
        rotate: [0, -1, 1, -1, 0],
        transition: {
          rotate: {
            repeat: Infinity,
            duration: rotationDuration
          }
        }
      }}
      whileTap={{ scale: 0.95 }}
      animate={{ scale }}
      transition={{ duration: 1 }}
      onClick={onClick}
    >
      <img src={icon} alt={label} className="mr-2 h-6 w-6" />
      <span className="font-medium text-gray-900">{label}</span>
    </motion.li>
  );
};

const NetworkBadge = ({
  network,
  isAnimating
}: {
  network: Networks;
  isAnimating: boolean;
}) => {
  const networkIcon = useGetNetworkIcon(network);
  const { handleNetworkSelect } = useNetworkTokenCompatibility();

  return (
    <Badge
      icon={networkIcon}
      label={getNetworkDisplayName(network)}
      isAnimating={isAnimating}
      rotationDuration={0.5}
      onClick={() => handleNetworkSelect(network, true)}
    />
  );
};

const TokenBadge = ({
  token,
  isAnimating
}: {
  token: { name: string; assetIcon: string };
  isAnimating: boolean;
}) => {
  const icon = useGetAssetIcon(token.assetIcon);
  return <Badge icon={icon} label={token.name} isAnimating={isAnimating} rotationDuration={0.3} />;
};

export function PopularTokens() {
  const { t } = useTranslation();

  const [animatingIndex, setAnimatingIndex] = useState<{
    type: "network" | "token";
    index: number;
  }>({
    type: "network",
    index: 0
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const isNetwork = Math.random() < 0.5;
      const maxIndex = isNetwork ? networks.length : tokens.length;
      const newIndex = Math.floor(Math.random() * maxIndex);

      setAnimatingIndex({
        type: isNetwork ? "network" : "token",
        index: newIndex
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto mt-8 max-w-2xl p-8 text-center">
      <div className="mb-12">
        <h2 className="font-bold text-3xl text-gray-900">{t("sections.popularTokens.networks.title")}</h2>
        <p className="mt-2 text-gray-600 text-lg">{t("sections.popularTokens.networks.description")}</p>

        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {networks.map((network, index) => (
            <NetworkBadge
              key={network}
              network={network}
              isAnimating={animatingIndex.type === "network" && index === animatingIndex.index}
            />
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-bold text-3xl text-gray-900">{t("sections.popularTokens.tokens.title")}</h2>
        <p className="mt-2 text-gray-600 text-lg">{t("sections.popularTokens.tokens.description")}</p>
        <motion.ul
          className="mt-4 flex flex-wrap items-center justify-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {tokens.map((token, index) => (
            <TokenBadge
              key={index}
              token={token}
              isAnimating={animatingIndex.type === "token" && index === animatingIndex.index}
            />
          ))}
        </motion.ul>
      </div>
    </div>
  );
}
