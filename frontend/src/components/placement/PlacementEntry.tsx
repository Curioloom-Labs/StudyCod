import React, { useEffect, useState } from "react";
import type { User } from "../../types";
import { PlacementOverlay } from "./PlacementOverlay";

export const PlacementEntry: React.FC<{
  user: User | null;
  onUserChange: (u: User) => void;
}> = ({ user, onUserChange }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Personal users only (Duolingo-like flow). EDU accounts are controlled by teacher/class.
    if (user.userMode && user.userMode !== "PERSONAL") return;
    if (user.studentId) return;

    const done = Boolean(user.placementDone);
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 350);
      return () => clearTimeout(timer);
    }
  }, [user?.id, user?.userMode, user?.studentId, user?.placementDone]);

  if (!user) return null;
  if (user.userMode && user.userMode !== "PERSONAL") return null;
  if (user.studentId) return null;

  return (
    <PlacementOverlay
      open={open}
      user={user}
      onUserChange={onUserChange}
      onClose={() => setOpen(false)}
    />
  );
};

export default PlacementEntry;
