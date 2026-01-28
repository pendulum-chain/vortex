import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { getNetworkDisplayName, Networks, PaymentMethod, roundDownToSignificantDecimals } from "@vortexfi/shared";
import Big from "big.js";
import { FC, useState } from "react";
import { useTokenIcon } from "../../../../hooks/useTokenIcon";
import { StatusBadge } from "../../../StatusBadge";
import { TokenIconWithNetwork } from "../../../TokenIconWithNetwork";
import { Transaction, TransactionDestination } from "../types";

interface TransactionItemProps {
  transaction: Transaction;
}

const formatDate = (date: Date) =>
  date.toLocaleString("default", {
    day: "numeric",
    month: "long"
  });

const formatTooltipDate = (date: Date) =>
  date.toLocaleString("default", {
    day: "numeric",
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
    month: "long",
    second: "2-digit",
    year: "numeric"
  });

const PAYMENT_METHODS: PaymentMethod[] = ["pix", "sepa", "cbu"];

function isNetwork(destination: TransactionDestination): destination is Networks {
  return !PAYMENT_METHODS.includes(destination as PaymentMethod);
}

const getNetworkName = (network: TransactionDestination) => {
  if (!isNetwork(network)) {
    return network.toUpperCase();
  }
  return getNetworkDisplayName(network);
};

export const TransactionItem: FC<TransactionItemProps> = ({ transaction }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Determine network for each currency (only on-chain tokens have networks)
  const fromNetwork = isNetwork(transaction.from) ? transaction.from : undefined;
  const toNetwork = isNetwork(transaction.to) ? transaction.to : undefined;

  const fromIcon = useTokenIcon(transaction.fromCurrency, fromNetwork);
  const toIcon = useTokenIcon(transaction.toCurrency, toNetwork);

  return (
    <div
      className="group flex items-center justify-between border-gray-200 border-b p-4 hover:bg-gray-50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center space-x-2">
        <div>
          <div className="relative h-8 w-16">
            <TokenIconWithNetwork
              className="absolute top-0 left-0 h-8 w-8"
              fallbackIconSrc={fromIcon.fallbackIconSrc}
              iconSrc={fromIcon.iconSrc}
              network={fromIcon.network}
              showNetworkOverlay={!!fromIcon.network}
              tokenSymbol={transaction.fromCurrency}
            />
            <TokenIconWithNetwork
              className="absolute top-0 left-5 h-8 w-8"
              fallbackIconSrc={toIcon.fallbackIconSrc}
              iconSrc={toIcon.iconSrc}
              network={toIcon.network}
              showNetworkOverlay={!!toIcon.network}
              tokenSymbol={transaction.toCurrency}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center">
            <span className="text-gray-500">{getNetworkName(transaction.from)}</span>
            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
            <span className="text-gray-500">{getNetworkName(transaction.to)}</span>
          </div>
          <div className="flex items-center">
            <span className="font-medium">{roundDownToSignificantDecimals(Big(transaction.fromAmount), 2).toString()}</span>
            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
            <span className="font-medium">{roundDownToSignificantDecimals(Big(transaction.toAmount), 2).toString()}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end space-y-2">
        <StatusBadge explorerLink={transaction.externalTxExplorerLink} isHovered={isHovered} status={transaction.status} />
        <div className="cursor-pointer text-gray-500 text-sm hover:text-gray-700">
          <div className="tooltip tooltip-left z-50" data-tip={formatTooltipDate(transaction.date)}>
            {formatDate(transaction.date)}
          </div>
        </div>
      </div>
    </div>
  );
};
