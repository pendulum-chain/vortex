import { Networks } from "@packages/shared";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { useRampModalState } from "../../../stores/rampModalStore";
import { useSetSelectedNetworkFilter, useToggleNetworkDropdown } from "../../../stores/tokenSelectionStore";
import { RampDirection } from "../../RampToggle";
import { SelectionNetworkButton } from "./components/SelectionNetworkButton";
import { SelectionNetworkDropdownContent } from "./components/SelectionNetworkDropdownContent";

export const NetworkDropdown = () => {
  const setSelectedNetworkFilter = useSetSelectedNetworkFilter();
  const toggleNetworkDropdown = useToggleNetworkDropdown();
  const { tokenSelectModalType } = useRampModalState();
  const rampDirection = useRampDirection();

  const isFiatTokenSelection = (() => {
    const isOnramp = rampDirection === RampDirection.ONRAMP;
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
