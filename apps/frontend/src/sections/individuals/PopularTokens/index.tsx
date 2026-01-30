import { doesNetworkSupportRamp, FiatToken, getNetworkDisplayName, Networks } from "@vortexfi/shared";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../helpers/cn";
import { isValidFiatIcon, useGetAssetIcon } from "../../../hooks/useGetAssetIcon";
import { useGetNetworkIcon } from "../../../hooks/useGetNetworkIcon";

const fiatTokens: Array<{ name: string; assetIcon: string }> = Object.values(FiatToken)
  .map(name => ({
    assetIcon: name.toLowerCase(),
    name
  }))
  .filter(token => isValidFiatIcon(token.assetIcon));

const networks = Object.values(Networks).filter(doesNetworkSupportRamp);

type BadgeProps = {
  icon: string;
  label: string;
  isAnimating: boolean;
  rotationDuration?: number;
  onClick?: () => void;
};

const Badge = ({ icon, label, isAnimating, rotationDuration = 0.5 }: BadgeProps) => {
  const scale = isAnimating ? 1.08 : 1;
  const bgColor = isAnimating ? "bg-gray-300" : "bg-secondary";

  return (
    <motion.li
      animate={{ scale }}
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full px-4 py-2 shadow-lg hover:bg-gray-200",
        bgColor
      )}
      transition={{ duration: 0.25 }}
      whileHover={{
        rotate: [0, -1, 1, -1, 0],
        scale: 1.08,
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

  return <Badge icon={networkIcon} isAnimating={isAnimating} label={getNetworkDisplayName(network)} rotationDuration={0.5} />;
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
      const maxIndex = isNetwork ? networks.length : fiatTokens.length;
      const newIndex = Math.floor(Math.random() * maxIndex);

      setAnimatingIndex({
        index: newIndex,
        type: isNetwork ? "network" : "token"
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <hr className="border-gray-100 border-b-1" />
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-10 lg:py-32">
        <div className="mb-12">
          <h2 className="text-gray-900 text-h2">{t("sections.popularTokens.networks.title")}</h2>
          <p className="mt-2 text-body-lg text-gray-600">{t("sections.popularTokens.networks.description")}</p>

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
          <h2 className="text-gray-900 text-h2">{t("sections.popularTokens.tokens.title")}</h2>
          <p className="mt-2 text-body-lg text-gray-600">{t("sections.popularTokens.tokens.description")}</p>
          <motion.ul
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
          >
            {fiatTokens.map((token, index) => (
              <TokenBadge
                isAnimating={animatingIndex.type === "token" && index === animatingIndex.index}
                key={index}
                token={token}
              />
            ))}
          </motion.ul>
        </div>
      </div>
    </>
  );
}
