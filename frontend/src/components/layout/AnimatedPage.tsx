import React, { createContext, useContext } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { pageVariants, reducedPageVariants } from "../../lib/motion";
import clsx from "classnames";

export const PageMotionScope = createContext(false);

export const AnimatedPage: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({
  children,
  className
}) => {
  const handledByParent = useContext(PageMotionScope);
  const shouldReduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  if (handledByParent) {
    return <div className={clsx("flex-1 min-h-0 flex flex-col", className)}>{children}</div>;
  }
  return <motion.div
    className={clsx("flex-1 min-h-0 flex flex-col", className)}
    style={isPresent ? undefined : { position: "absolute", inset: 0, width: "100%", pointerEvents: "none" }}
    variants={shouldReduceMotion ? reducedPageVariants : pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
  >
      {children}
    </motion.div>;
};
