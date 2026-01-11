import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { MarkdownView } from "../MarkdownView";
import { Button } from "../ui/Button";
type Props = {
  open: boolean;
  title: string;
  markdown: string;
  acknowledgeLabel: string;
  onAcknowledge: () => void;
};
export const TheoryModalPortal: React.FC<Props> = ({
  open,
  title,
  markdown,
  acknowledgeLabel,
  onAcknowledge
}) => {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[9999] bg-black/80" style={{
    backdropFilter: "blur(2px)"
  }} aria-modal="true" role="dialog">
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <div className="bg-bg-surface border border-border w-[98vw] max-w-[1200px] max-h-[92dvh] flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex-shrink-0">
            <h2 className="text-lg font-mono text-text-primary">{title}</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <MarkdownView content={markdown} />
          </div>

          <div className="px-6 py-4 border-t border-border flex justify-end flex-shrink-0">
            <Button variant="primary" onClick={onAcknowledge}>
              {acknowledgeLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>, document.body);
};