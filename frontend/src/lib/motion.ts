import type { Variants, Transition } from "framer-motion";
export const easeOutExpo: Transition["ease"] = [0.16, 1, 0.3, 1];
export const easeOutQuint: Transition["ease"] = [0.22, 1, 0.36, 1];
export const pageTransition: Transition = {
  type: "spring",
  bounce: 0,
  duration: 0.38
};
export const reducedMotionTransition: Transition = {
  duration: 0.18,
  ease: "linear"
};
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    scale: 1
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: pageTransition
  },
  exit: {
    opacity: 0,
    y: -4,
    scale: 1,
    transition: {
      duration: 0.18,
      ease: easeOutQuint
    }
  }
};
export const reducedPageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 0,
    scale: 1
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: reducedMotionTransition
  },
  exit: {
    opacity: 0,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.14,
      ease: "linear"
    }
  }
};
export const overlayVariants: Variants = {
  initial: {
    opacity: 0,
    backdropFilter: "blur(0px)"
  },
  animate: {
    opacity: 1,
    backdropFilter: "blur(2px)",
    transition: {
      duration: 0.2,
      ease: easeOutExpo
    }
  },
  exit: {
    opacity: 0,
    backdropFilter: "blur(0px)",
    transition: {
      duration: 0.15,
      ease: easeOutExpo
    }
  }
};
export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    y: 14,
    scale: 0.985
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: pageTransition
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.98,
    transition: {
      duration: 0.24,
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
