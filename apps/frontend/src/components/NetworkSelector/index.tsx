import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { getNetworkDisplayName, getNetworkId, Networks } from "@vortexfi/shared";
import { AnimatePresence, motion } from "motion/react";
import { RefObject, useEffect, useRef, useState } from "react";
import { useNetwork } from "../../contexts/network";
import { cn } from "../../helpers/cn";
import { useNetworkTokenCompatibility } from "../../hooks/useNetworkTokenCompatibility";
import { NetworkIcon } from "../NetworkIcon";

interface NetworkButtonProps {
  selectedNetwork: Networks;
  isOpen: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const supportedNetworks = Object.values(Networks).filter(
  network => network !== Networks.Pendulum && network !== Networks.Stellar && network !== Networks.Moonbeam
);

const NetworkButton = ({ selectedNetwork, isOpen, onClick, disabled }: NetworkButtonProps) => (
  <motion.button
    className={cn(
      "flex items-center gap-2 rounded-full bg-base-100 px-2 py-3 sm:px-4",
      disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
    )}
    disabled={disabled}
    onClick={onClick}
    whileHover={{ scale: disabled ? 1 : 1.02 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
  >
    <NetworkIcon className={cn("h-5 w-5", disabled && "opacity-50")} network={selectedNetwork} />
    <span className={cn("hidden sm:block", disabled && "opacity-50")}>{getNetworkDisplayName(selectedNetwork)}</span>
    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className={cn(disabled && "opacity-50")} transition={{ duration: 0.2 }}>
      <ChevronDownIcon className="ml-1 block h-4 w-4" />
    </motion.div>
  </motion.button>
);

interface NetworkDropdownProps {
  isOpen: boolean;
  onNetworkSelect: (network: Networks) => void;
  disabled?: boolean;
}

const NetworkDropdown = ({ isOpen, onNetworkSelect, disabled }: NetworkDropdownProps) => (
  <AnimatePresence>
    {isOpen && !disabled && (
      <motion.div
        animate={{ opacity: 1 }}
        className="absolute z-50 mt-2 w-48 whitespace-nowrap rounded-box bg-base-100 p-2 shadow-lg"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        layout
        transition={{ duration: 0.2 }}
      >
        {supportedNetworks.map(network => {
          const networkId = getNetworkId(network);
          return (
            <button
              className="flex w-full items-center gap-2 rounded-lg p-2 hover:bg-base-200"
              key={networkId}
              onClick={() => onNetworkSelect(network)}
              translate="no"
            >
              <NetworkIcon className="h-5 w-5" network={network} />
              <span>{getNetworkDisplayName(network)}</span>
            </button>
          );
        })}
      </motion.div>
    )}
  </AnimatePresence>
);

function useClickOutside(ref: RefObject<HTMLElement | null>, callback: () => void) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [callback, ref]);
}

export const NetworkSelector = ({ disabled }: { disabled?: boolean }) => {
  const { selectedNetwork } = useNetwork();
  const { handleNetworkSelect } = useNetworkTokenCompatibility();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const handleNetworkChange = (network: Networks) => {
    handleNetworkSelect(network, true);
    setIsOpen(false);
  };

  const wrapperProps = disabled
    ? {
        className: "tooltip tooltip-primary tooltip-bottom before:whitespace-pre-wrap before:content-[attr(data-tip)]",
        "data-tip": "The offramp is in progress. Cannot switch networks."
      }
    : {};

  return (
    <div {...wrapperProps}>
      <div className={cn("relative mr-2", disabled && "pointer-events-none")} ref={dropdownRef}>
        <NetworkButton
          disabled={disabled}
          isOpen={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          selectedNetwork={selectedNetwork}
        />
        <NetworkDropdown disabled={disabled} isOpen={isOpen} onNetworkSelect={handleNetworkChange} />
      </div>
    </div>
  );
};
