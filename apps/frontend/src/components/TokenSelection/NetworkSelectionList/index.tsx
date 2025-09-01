import { Networks, RampDirection } from "@packages/shared";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useTokenSelectionActions, useTokenSelectionState } from "../../../stores/tokenSelectionStore";
import { SelectionNetworkButton } from "./components/SelectionNetworkButton";
import { SelectionNetworkDropdownContent } from "./components/SelectionNetworkDropdownContent";

export const NetworkDropdown = () => {
  const { setSelectedNetworkFilter, toggleNetworkDropdown } = useTokenSelectionActions();
  const { tokenSelectModalType } = useTokenSelectionState();
  const rampDirection = useRampDirection();

  const isFiatTokenSelection = (() => {
    const isOnramp = rampDirection === RampDirection.BUY;
    return (isOnramp && tokenSelectModalType === "from") || (!isOnramp && tokenSelectModalType === "to");
  })();

  if (isFiatTokenSelection) {
    return null;
  }

  const handleNetworkSelect = (network: Networks | "all") => {
    setSelectedNetworkFilter(network);
  };

  return (
    <>
      <SelectionNetworkButton onToggle={toggleNetworkDropdown} />
      <SelectionNetworkDropdownContent onNetworkSelect={handleNetworkSelect} />
    </>
  );
};
