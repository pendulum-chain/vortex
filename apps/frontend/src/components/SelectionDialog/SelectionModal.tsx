import { useRampModalState } from "../../stores/rampModalStore";
import { Skeleton } from "../Skeleton";
import { TokenSelectionList } from "./TokenSelectionList";

export function PoolSelectorModal() {
  const { isOpen, isLoading } = useRampModalState();
  const content = isLoading ? <LoadingContent /> : <TokenSelectionList />;

  return isOpen ? content : null;
}

function LoadingContent() {
  return <Skeleton className="mb-2 h-10 w-full" />;
}
