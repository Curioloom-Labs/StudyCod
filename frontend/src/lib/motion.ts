import type { Variants, Transition } from "framer-motion";
export const easeOutExpo: Transition["ease"] = [0.16, 1, 0.3, 1];
export const pageTransition: Transition = {
  duration: 0.28,
  ease: easeOutExpo
};
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 10,
    filter: "blur(6px)"
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: pageTransition
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(6px)",
    transition: {
      duration: 0.2,
      ease: easeOutExpo
    }
  }
};
export const overlayVariants: Variants = {
  initial: {
    opacity: 0
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.18,
      ease: easeOutExpo
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.14,
      ease: easeOutExpo
    }
  }
};
export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    y: 14,
    scale: 0.98,
    filter: "blur(6px)"
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: pageTransition
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.98,
    filter: "blur(6px)",
    transition: {
      duration: 0.18,
      ease: easeOutExpo
    }
  }
};
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02
    }
  }
};
export const fadeUpItem: Variants = {
  initial: {
    opacity: 0,
    y: 8
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: easeOutExpo
    }
  }
};