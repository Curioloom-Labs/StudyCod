import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { AnimatePresence, motion } from "framer-motion";
import { overlayVariants, modalVariants } from "../../lib/motion";
interface Props {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  closable?: boolean;
  showCloseButton?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
}
const DEFAULT_CLOSABLE = true;
const DEFAULT_SHOW_CLOSE_BUTTON = true;
export const Modal: React.FC<Props> = ({
  open,
  isOpen,
  title,
  description,
  onClose,
  children,
  closable,
  showCloseButton,
  overlayClassName,
  panelClassName,
  bodyClassName
}) => {
  const {
    t
  } = useTranslation();
  const resolvedOpen = open ?? isOpen ?? false;
  const isClosable = closable ?? DEFAULT_CLOSABLE;
  const shouldShowCloseButton = showCloseButton ?? DEFAULT_SHOW_CLOSE_BUTTON;
  const content = <AnimatePresence>
      {resolvedOpen && <motion.div className={"fixed inset-0 z-50 flex items-center justify-center bg-black/80" + (overlayClassName ? ` ${overlayClassName}` : "")} onClick={isClosable ? onClose : undefined} style={{
      backdropFilter: "blur(2px)"
    }} variants={overlayVariants} initial="initial" animate="animate" exit="exit">
          <motion.div className={"bg-bg-surface border border-border max-w-[900px] w-[95vw] max-h-[95vh] flex flex-col overflow-hidden" + (panelClassName ? ` ${panelClassName}` : "")} onClick={e => e.stopPropagation()} variants={modalVariants} initial="initial" animate="animate" exit="exit">
            {title && <div className="px-6 py-4 border-b border-border flex-shrink-0">
                <h2 className="text-lg font-mono text-text-primary">{title}</h2>
                {description && <p className="text-sm text-text-secondary mt-2 whitespace-pre-line">{description}</p>}
              </div>}
            <div className={"flex-1 overflow-y-auto px-6 py-4" + (bodyClassName ? ` ${bodyClassName}` : "")}>
              {children}
            </div>
            {shouldShowCloseButton && <div className="px-6 py-4 border-t border-border flex justify-end flex-shrink-0">
                <Button variant="ghost" onClick={onClose}>
                  {t('close')}
                </Button>
              </div>}
          </motion.div>
        </motion.div>}
    </AnimatePresence>;
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
};