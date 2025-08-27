import { useAnimationControls } from "motion/react";
import { useCallback } from "react";

interface UseCircularProgressAnimationReturn {
  animationControls: ReturnType<typeof useAnimationControls>;
  startAnimation: (duration: number) => void;
  stopAnimation: () => void;
}

export const useCircularProgressAnimation = (circumference: number): UseCircularProgressAnimationReturn => {
  const animationControls = useAnimationControls();

  const startAnimation = useCallback(
    (duration: number) => {
      animationControls.set({ strokeDashoffset: circumference });
      animationControls.start({
        strokeDashoffset: 0,
        transition: { duration, ease: "linear" }
      });
    },
    [animationControls, circumference]
  );

  const stopAnimation = useCallback(() => {
    animationControls.stop();
  }, [animationControls]);

  return {
    animationControls,
    startAnimation,
    stopAnimation
  };
};
