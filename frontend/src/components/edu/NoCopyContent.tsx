import React from "react";
import "./noCopyContent.css";

type Props = React.PropsWithChildren<{
  className?: string;
  label?: string;
}>;

export const NoCopyContent: React.FC<Props> = ({ children, className = "", label }) => {
  const preventClipboardAction = (event: React.ClipboardEvent<HTMLDivElement>) => event.preventDefault();

  return <div
    className={`edu-no-copy ${className}`.trim()}
    aria-label={label}
    onCopy={preventClipboardAction}
    onCut={preventClipboardAction}
    onContextMenu={event => event.preventDefault()}
    onDragStart={event => event.preventDefault()}
    onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && ["a", "c", "x"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    }}
  >{children}</div>;
};

