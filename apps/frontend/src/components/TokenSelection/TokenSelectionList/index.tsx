import { useRampModalActions } from "../../../stores/rampModalStore";
import { PageHeader } from "../../PageHeader";
import { SelectionTokenList } from "./components/SelectionTokenList";
import { TokenSelectionControls } from "./components/TokenSelectionControls";

export function TokenSelectionList() {
  const { closeTokenSelectModal } = useRampModalActions();

  const handleClose = () => {
    closeTokenSelectModal();
  };

  return (
    <section className="absolute top-0 right-0 bottom-0 left-0 z-50 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg">
      <PageHeader onClose={handleClose} title="Select a token" />
      <TokenSelectionControls />
      <SelectionTokenList />
    </section>
  );
}
