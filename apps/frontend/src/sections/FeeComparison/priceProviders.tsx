import { PriceProvider } from "@packages/shared";
import vortexIcon from "../../assets/logo/blue.svg";
import alchemyPayIcon from "../../assets/offramp/alchemypay.svg";
import moonpayIcon from "../../assets/offramp/moonpay.svg";
import transakIcon from "../../assets/offramp/transak.svg";

import { JSX } from "react";
export interface PriceProviderDetails {
  name: PriceProvider | "vortex";
  icon?: JSX.Element;
  href: string;
}

export const priceProviders: PriceProviderDetails[] = [
  {
    name: "alchemypay",
    icon: <img src={alchemyPayIcon} className="ml-1 w-40" alt="AlchemyPay" />,
    href: "https://alchemypay.org"
  },
  {
    name: "moonpay",
    icon: <img src={moonpayIcon} className="ml-1 w-40" alt="Moonpay" />,
    href: "https://moonpay.com"
  },
  {
    name: "transak",
    icon: <img src={transakIcon} className="h-10 w-30" alt="Transak" />,
    href: "https://transak.com"
  },
  {
    name: "vortex",
    icon: <img src={vortexIcon} className="h-10 w-36" alt="Vortex" />,
    href: ""
  }
];
