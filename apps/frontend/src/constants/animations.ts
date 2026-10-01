import { Variants } from "motion/react";

/**
 * Standardized easing curves for UI animations
 * - Use easeOut for entering elements (feels responsive)
 * - Use easeInOut only for on-screen movement
 * - Never use easeIn for UI (feels sluggish)
 */
export const easings = {
  easeInOutCubic: [0.645, 0.045, 0.355, 1] as const,
  easeOutCubic: [0.215, 0.61, 0.355, 1] as const,
  easeOutQuint: [0.23, 1, 0.32, 1] as const
};

/**
 * Duration guidelines for different interaction types
 */
export const durations = {
  fast: 0.15, // 150ms - tooltips, dropdowns
  micro: 0.1, // 100ms - micro-interactions (hover states)
  normal: 0.2, // 200ms - standard UI animations
  slow: 0.3 // 300ms - modals, drawers, complex transitions
};

/**
 * Animation variants for word-by-word title animations
 * with 3D transform effects
 */
export const wordVariants: Variants = {
  hidden: {
    filter: "blur(3px)",
    opacity: 0,
    rotateX: "-45deg",
    scale: 0.9,
    y: 10
  },
  visible: {
    filter: "blur(0px)",
    opacity: 1,
    rotateX: 0,
    scale: 1,
    transition: { damping: 20, duration: 0.4, ease: "easeOut", stiffness: 400, type: "spring" },
    y: 0
  }
};

/**
 * Simple fade-in with upward motion
 * Used for paragraphs, buttons, and simple content
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: (delay = 0) => ({
    opacity: 1,
    transition: { delay, duration: 0.2, ease: "easeOut" },
    y: 0
  })
};

/**
 * Stagger container for sequential animations
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

/**
 * Utility to check if user prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
