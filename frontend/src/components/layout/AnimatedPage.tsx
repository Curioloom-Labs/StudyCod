import React from "react";
import { motion } from "framer-motion";
import { pageVariants } from "../../lib/motion";
import clsx from "classnames";
export const AnimatedPage: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({
  children,
  className
}) => {
  return <motion.div className={clsx("flex-1 min-h-0 flex flex-col", className)} variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>;
};