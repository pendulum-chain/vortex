import ARS from "../assets/coins/ARS.png";
import BRL from "../assets/coins/BRL.png";
import EUR from "../assets/coins/EUR.svg";
import EURC from "../assets/coins/EURC.png";
import USDC from "../assets/coins/USDC.png";
import USDC_ARBITRUM from "../assets/coins/USDC_ARBITRUM.svg";
import USDC_ASSETHUB from "../assets/coins/USDC_ASSETHUB.svg";
import USDC_AVALANCHE from "../assets/coins/USDC_AVALANCHE.svg";
import USDC_BASE from "../assets/coins/USDC_BASE.svg";
import USDC_BSC from "../assets/coins/USDC_BSC.svg";
import USDC_ETHEREUM from "../assets/coins/USDC_ETHEREUM.svg";
import USDC_POLYGON from "../assets/coins/USDC_POLYGON.svg";
import USDT from "../assets/coins/USDT.svg";
import USDT_ARBITRUM from "../assets/coins/USDT_ARBITRUM.svg";
import USDT_AVALANCHE from "../assets/coins/USDT_AVALANCHE.svg";
import USDT_BASE from "../assets/coins/USDT_BASE.svg";
import USDT_BSC from "../assets/coins/USDT_BSC.svg";
import USDT_ETHEREUM from "../assets/coins/USDT_ETHEREUM.svg";
import USDT_POLYGON from "../assets/coins/USDT_POLYGON.svg";

const ICONS = {
  arbitrumUSDC: USDC_ARBITRUM,
  arbitrumUSDT: USDT_ARBITRUM,
  ars: ARS,
  assethubUSDC: USDC_ASSETHUB,
  avalancheUSDC: USDC_AVALANCHE,
  avalancheUSDT: USDT_AVALANCHE,
  baseUSDC: USDC_BASE,
  baseUSDT: USDT_BASE,
  brl: BRL,
  bscUSDC: USDC_BSC,
  bscUSDT: USDT_BSC,
  ethereumUSDC: USDC_ETHEREUM,
  ethereumUSDT: USDT_ETHEREUM,
  eur: EUR,
  eurc: EURC,
  polygonUSDC: USDC_POLYGON,
  polygonUSDT: USDT_POLYGON,
  usdc: USDC,
  usdt: USDT
};

export type AssetIconType = keyof typeof ICONS;

export function useGetAssetIcon(assetIcon: string) {
  if (assetIcon in ICONS) {
    return ICONS[assetIcon as AssetIconType];
  } else {
    console.error(`Asset icon not found for ${assetIcon}`);
    // Return USDC as default icon
    return ICONS["usdc"];
  }
}
