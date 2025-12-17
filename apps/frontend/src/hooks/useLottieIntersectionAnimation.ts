import { LottieRefCurrentProps } from "lottie-react";
import { RefObject, useEffect, useRef } from "react";

interface UseLottieIntersectionAnimationOptions {
  threshold?: number;
  onComplete?: () => void;
}

interface UseLottieIntersectionAnimationReturn {
  lottieRef: RefObject<LottieRefCurrentProps | null>;
  cardRef: RefObject<HTMLElement | null>;
  handleMouseEnter: () => void;
  handleAnimationComplete: () => void;
}

/**
 * Custom hook to handle Lottie animations with Intersection Observer
 * Plays animation on scroll into view (once) and on hover (repeatable)
 *
 * @param options - Configuration options
 * @returns Refs and handlers for Lottie animation control
 */
export const useLottieIntersectionAnimation = (
  options: UseLottieIntersectionAnimationOptions = {}
): UseLottieIntersectionAnimationReturn => {
  const { threshold = 0.7, onComplete } = options;

  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const cardRef = useRef<HTMLElement>(null);
  const hasPlayedOnce = useRef(false);
  const isPlaying = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && lottieRef.current && !hasPlayedOnce.current) {
            lottieRef.current.play();
            hasPlayedOnce.current = true;
            isPlaying.current = true;
          }
        });
      },
      { threshold }
    );

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  const handleMouseEnter = () => {
    if (lottieRef.current && !isPlaying.current) {
      lottieRef.current.stop();
      lottieRef.current.goToAndStop(0, true);
      lottieRef.current.setDirection(1);
      lottieRef.current.play();
      isPlaying.current = true;
    }
  };

  const handleAnimationComplete = () => {
    isPlaying.current = false;
    onComplete?.();
  };

  return {
    cardRef,
    handleAnimationComplete,
    handleMouseEnter,
    lottieRef
  };
};
