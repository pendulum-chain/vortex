import { Variants } from "motion/react";

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
 * Feature card animations with alternating directions
 */
export const featureCardVariants = {
  hidden: (index: number) => ({
    rotateZ: index % 2 === 0 ? -15 : 15,
    scale: 0.9,
    x: index % 2 === 0 ? -40 : 40,
    y: 20
  }),
  visible: {
    rotateZ: 0,
    scale: 1,
    transition: { duration: 0.4 },
    x: 0,
    y: 0
  }
};

/**
 * Utility to check if user prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

/**
 * Get transition with reduced motion support
 */
export const getTransition = (transition: object) => {
  return prefersReducedMotion() ? { duration: 0 } : transition;
};
