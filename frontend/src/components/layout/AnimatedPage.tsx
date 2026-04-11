import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { pageVariants, reducedPageVariants } from "../../lib/motion";
import clsx from "classnames";
export const AnimatedPage: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({
  children,
  className
}) => {
  const shouldReduceMotion = useReducedMotion();
  return <motion.div className={clsx("flex-1 min-h-0 flex flex-col", className)} variants={shouldReduceMotion ? reducedPageVariants : pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>;
};
