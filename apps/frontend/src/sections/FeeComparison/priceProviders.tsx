import { PriceProvider } from "@packages/shared";
import { JSX } from "react";
import vortexIcon from "../../assets/logo/blue.svg";
import alchemyPayIcon from "../../assets/offramp/alchemypay.svg";
import moonpayIcon from "../../assets/offramp/moonpay.svg";
import transakIcon from "../../assets/offramp/transak.svg";

export interface PriceProviderDetails {
  name: PriceProvider | "vortex";
  icon?: JSX.Element;
  href: string;
}

export const priceProviders: PriceProviderDetails[] = [
  {
    href: "https://alchemypay.org",
    icon: <img alt="AlchemyPay" className="ml-1 w-40" src={alchemyPayIcon} />,
    name: "alchemypay"
  },
  {
    href: "https://moonpay.com",
    icon: <img alt="Moonpay" className="ml-1 w-40" src={moonpayIcon} />,
    name: "moonpay"
  },
  {
    href: "https://transak.com",
    icon: <img alt="Transak" className="h-10 w-30" src={transakIcon} />,
    name: "transak"
  },
  {
    href: "",
    icon: <img alt="Vortex" className="h-10 w-36" src={vortexIcon} />,
    name: "vortex"
  }
];
