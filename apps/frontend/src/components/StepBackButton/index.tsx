import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useStepBackNavigation } from "../../hooks/useStepBackNavigation";

export const StepBackButton = () => {
  const { handleBack, shouldHide } = useStepBackNavigation();

  if (shouldHide) {
    return null;
  }

  return (
    <button className={"btn-vortex-accent cursor-pointer px-3.5 py-1.5"} onClick={handleBack} type="button">
      <ArrowLeftIcon className="h-5 w-5" />
    </button>
  );
};
