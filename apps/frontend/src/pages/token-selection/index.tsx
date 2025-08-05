import { Skeleton } from "../../components/Skeleton";
import { TokenSelectionList } from "../../components/TokenSelection/TokenSelectionList";
import { useRampModalState } from "../../stores/rampModalStore";

export function TokenSelectionPage() {
  const { isOpen, isLoading } = useRampModalState();
  const content = isLoading ? <LoadingContent /> : <TokenSelectionList />;

  return isOpen ? content : null;
}

function LoadingContent() {
  return <Skeleton className="mb-2 h-10 w-full" />;
}
