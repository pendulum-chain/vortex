import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import {
  AssetHubToken,
  assetHubTokenConfig,
  doesNetworkSupportRamp,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getNetworkDisplayName,
  Networks
} from "@vortexfi/shared";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import VORTEX from "../../../assets/logo/vortex_x.svg";
import CIRCLE from "../../../assets/trusted-by/circle.svg";
import PENDULUM from "../../../assets/trusted-by/pendulum-icon.svg";
import { cn } from "../../../helpers/cn";
import { isValidAssetIcon, useGetAssetIcon } from "../../../hooks/useGetAssetIcon";
import { useGetNetworkIcon } from "../../../hooks/useGetNetworkIcon";

const getEvmTokenIcon = (token: EvmToken): string => {
  for (const networkConfig of Object.values(evmTokenConfig)) {
    const tokenConfig = networkConfig[token];
    if (tokenConfig?.networkAssetIcon) {
      return tokenConfig.networkAssetIcon;
    }
  }
  return token.toLowerCase();
};

const getTokenIcon = (name: string): string => {
  if (Object.values(EvmToken).includes(name as EvmToken)) {
    return getEvmTokenIcon(name as EvmToken);
  }
  if (Object.values(AssetHubToken).includes(name as AssetHubToken)) {
    const config = assetHubTokenConfig[name as AssetHubToken];
    return config?.networkAssetIcon || name.toLowerCase() || "";
  }

  return name.toLowerCase() || "";
};

const allCurrencies = Array.from(
  new Set([...Object.values(FiatToken), ...Object.values(AssetHubToken), ...Object.values(EvmToken)])
);

const tokens: Array<{ name: string; assetIcon: string }> = allCurrencies
  .map(name => ({
    assetIcon: getTokenIcon(name),
    name
  }))
  .filter(token => isValidAssetIcon(token.assetIcon));

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
    <>
      <div className="container mx-auto py-32">
        <div className="flex flex-col items-center justify-center">
          <motion.h2
            className="text-gray-900 text-h2"
            initial={{ opacity: 0, y: 20 }}
            transition={{ damping: 20, stiffness: 240, type: "spring" }}
            viewport={{ margin: "0px 0px -80px 0px", once: true }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            Vortex everywhere
          </motion.h2>
          <p className="mt-2 text-body-lg text-gray-600">Join our network of official partners</p>
          <div className="mt-12 grid gap-8 sm:grid-cols-[1fr_1fr_1fr]">
            <motion.div
              className="group relative"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{
                damping: 20,
                duration: 0.25,
                stiffness: 240,
                type: "spring"
              }}
              viewport={{ margin: "0px 0px -80px 0px", once: true }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
            >
              <a
                className="flex items-center justify-center rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-100 px-8 py-6 font-normal shadow-lg transition-all duration-150 hover:scale-103"
                href="https://partners.circle.com/partner/vortex"
                rel="noopener noreferrer"
                target="_blank"
              >
                <img
                  alt="Circle Internet Group"
                  className="h-[120px] grayscale transition-all duration-300 group-hover:grayscale-0"
                  src={CIRCLE}
                />
              </a>
              <div className="-translate-x-1/2 pointer-events-none invisible absolute bottom-full left-1/2 mb-2 flex w-full items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-primary-content text-sm opacity-0 shadow-lg transition-opacity duration-200 group-hover:visible group-hover:opacity-100">
                <p>
                  We're an official partner of Circle. <ArrowTopRightOnSquareIcon className="mb-0.5 inline-block h-4 w-4" />
                </p>
              </div>
            </motion.div>
            <div className="flex scale-120 items-center justify-center rounded-lg bg-gradient-to-r from-blue-700 via-blue-700 to-blue-800 px-8 py-12 shadow-lg transition-all duration-150 hover:scale-125">
              <img alt="Vortex" className="h-[80px]" src={VORTEX} />
            </div>
            <motion.div
              className="group relative"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{
                damping: 20,
                duration: 0.25,
                stiffness: 240,
                type: "spring"
              }}
              viewport={{ margin: "0px 0px -80px 0px", once: true }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
            >
              <a
                className="flex flex-col items-center justify-center rounded-lg bg-gradient-to-r from-gray-50 via-gray-100 to-gray-100 px-8 py-6 shadow-lg transition-all duration-150 hover:scale-103 hover:from-gray-100 hover:to-gray-200"
                href="https://partners.circle.com/partner/vortex"
                rel="noopener noreferrer"
                target="_blank"
              >
                <img
                  alt="Pendulum Chain"
                  className="h-[120px] grayscale transition-all duration-300 group-hover:grayscale-0"
                  src={PENDULUM}
                />
              </a>
              <div className="-translate-x-1/2 pointer-events-none invisible absolute bottom-full left-1/2 mb-2 flex w-full items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-primary-content text-sm opacity-0 shadow-lg transition-opacity duration-200 group-hover:visible group-hover:opacity-100">
                <p>Our infrastructure is powered by Pendulum.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
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
    </>
  );
}
