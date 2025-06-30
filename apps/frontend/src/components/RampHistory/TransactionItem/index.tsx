import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { getNetworkDisplayName, Networks, roundDownToSignificantDecimals } from "@packages/shared";
import Big from "big.js";
import { FC } from "react";
import { useGetAssetIcon } from "../../../hooks/useGetAssetIcon";
import { StatusBadge } from "../../StatusBadge";
import { Transaction } from "../types";

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

const getNetworkName = (network: Transaction["fromNetwork"] | Transaction["toNetwork"]) => {
  if (typeof network === "string" && ["pix", "sepa", "cbu"].includes(network)) {
    return network.toUpperCase();
  }
  return getNetworkDisplayName(network as Networks);
};

export const TransactionItem: FC<TransactionItemProps> = ({ transaction }) => {
  const fromIcon = useGetAssetIcon(transaction.fromCurrency.toLowerCase());
  const toIcon = useGetAssetIcon(transaction.toCurrency.toLowerCase());

  return (
    <div className="flex items-center justify-between border-gray-200 border-b p-4 hover:bg-gray-50">
      <div className="flex items-center space-x-4">
        <div>
          <div className="relative h-8 w-16">
            <img alt={transaction.fromCurrency} className="absolute top-0 left-0 h-8 w-8" src={fromIcon} />
            <img alt={transaction.toCurrency} className="absolute top-0 left-5 h-8 w-8" src={toIcon} />
          </div>
        </div>
        <div>
          <div className="flex items-center">
            <span className="text-gray-500">{getNetworkName(transaction.fromNetwork)}</span>
            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
            <span className="text-gray-500">{getNetworkName(transaction.toNetwork)}</span>
          </div>
          <div className="flex items-center">
            <span className="font-medium">{roundDownToSignificantDecimals(Big(transaction.fromAmount), 2).toString()}</span>
            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
            <span className="font-medium">{roundDownToSignificantDecimals(Big(transaction.toAmount), 2).toString()}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end space-y-2">
        <StatusBadge status={transaction.status} />
        <div className="cursor-pointer text-gray-500 text-sm hover:text-gray-700">
          <div className="tooltip tooltip-left z-50" data-tip={formatTooltipDate(transaction.date)}>
            {formatDate(transaction.date)}
          </div>
        </div>
      </div>
    </div>
  );
};
