import React from "react";
import { Modal } from "../../components/ui/Modal";

type Props = Omit<React.ComponentProps<typeof Modal>, "open" | "isOpen"> & { open: boolean };

/** A credential step hands focus to the next step without an exiting second dialog. */
export function CredentialWorkflowModal({ open, ...props }: Props) {
  return open ? <Modal {...props} open /> : null;
}
