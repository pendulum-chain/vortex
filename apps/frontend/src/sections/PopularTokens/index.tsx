import { getNetworkDisplayName, Networks } from "@packages/shared";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../helpers/cn";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { useGetNetworkIcon } from "../../hooks/useGetNetworkIcon";
import { useNetworkTokenCompatibility } from "../../hooks/useNetworkTokenCompatibility";

const tokens: Array<{ name: string; assetIcon: string }> = [
  { assetIcon: "usdc", name: "USDC" },
  { assetIcon: "usdc", name: "USDC.e" },
  { assetIcon: "usdt", name: "USDT" },
  { assetIcon: "brl", name: "BRLA" },
  { assetIcon: "ars", name: "ARS" },
  { assetIcon: "eurc", name: "EURC" }
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
      animate={{ scale }}
      className={cn(
        "flex items-center justify-center rounded-full px-4 py-2 shadow-lg",
        bgColor,
        onClick && "cursor-pointer active:scale-95 active:bg-gray-400"
      )}
      onClick={onClick}
      transition={{ duration: 1 }}
      whileHover={{
        rotate: [0, -1, 1, -1, 0],
        scale: 1.05,
        transition: {
          rotate: {
            duration: rotationDuration,
            repeat: Infinity
          }
        }
      }}
      whileTap={{ scale: 0.95 }}
    >
      <img alt={label} className="mr-2 h-6 w-6" src={icon} />
      <span className="font-medium text-gray-900">{label}</span>
    </motion.li>
  );
};

const NetworkBadge = ({ network, isAnimating }: { network: Networks; isAnimating: boolean }) => {
  const networkIcon = useGetNetworkIcon(network);
  const { handleNetworkSelect } = useNetworkTokenCompatibility();

  return (
    <Badge
      icon={networkIcon}
      isAnimating={isAnimating}
      label={getNetworkDisplayName(network)}
      onClick={() => handleNetworkSelect(network, true)}
      rotationDuration={0.5}
    />
  );
};

const TokenBadge = ({ token, isAnimating }: { token: { name: string; assetIcon: string }; isAnimating: boolean }) => {
  const icon = useGetAssetIcon(token.assetIcon);
  return <Badge icon={icon} isAnimating={isAnimating} label={token.name} rotationDuration={0.3} />;
};

export function PopularTokens() {
  const { t } = useTranslation();

  const [animatingIndex, setAnimatingIndex] = useState<{
    type: "network" | "token";
    index: number;
  }>({
    index: 0,
    type: "network"
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const isNetwork = Math.random() < 0.5;
      const maxIndex = isNetwork ? networks.length : tokens.length;
      const newIndex = Math.floor(Math.random() * maxIndex);

      setAnimatingIndex({
        index: newIndex,
        type: isNetwork ? "network" : "token"
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
              isAnimating={animatingIndex.type === "network" && index === animatingIndex.index}
              key={network}
              network={network}
            />
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-bold text-3xl text-gray-900">{t("sections.popularTokens.tokens.title")}</h2>
        <p className="mt-2 text-gray-600 text-lg">{t("sections.popularTokens.tokens.description")}</p>
        <motion.ul
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-2"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          {tokens.map((token, index) => (
            <TokenBadge
              isAnimating={animatingIndex.type === "token" && index === animatingIndex.index}
              key={index}
              token={token}
            />
          ))}
        </motion.ul>
      </div>
    </div>
  );
}
