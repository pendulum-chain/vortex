import { memo } from "react";
import { Spinner } from "../Spinner";

export const LoadingScreen = memo(() => {
  return (
    <div className="flex min-h-[480px] flex-col items-center justify-center space-y-4 py-8">
      <Spinner size="lg" theme="dark" />
    </div>
  );
});

LoadingScreen.displayName = "LoadingScreen";
