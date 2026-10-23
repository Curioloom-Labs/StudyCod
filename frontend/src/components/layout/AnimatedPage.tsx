import React from "react";
import clsx from "classnames";

export const AnimatedPage: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({
  children,
  className
}) => {
  return <div className={clsx("flex-1 min-h-0 flex flex-col", className)}>
    {children}
  </div>;
};
