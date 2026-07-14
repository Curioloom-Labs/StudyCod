import React, { useEffect, useState } from "react";
import type { User } from "../../types";
import { PlacementOverlay } from "./PlacementOverlay";

export const PlacementEntry: React.FC<{
  user: User | null;
  onUserChange: (u: User) => void;
}> = ({ user, onUserChange }) => {
  const [open, setOpen] = useState(false);

  const hasDebugForceOpen = (): boolean => {
    if (typeof window === "undefined") return false;
    try {
      const params = new URLSearchParams(window.location.search || "");
      return params.get("placementDebug") === "1";
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!user) return;

    // Personal users only (Duolingo-like flow). EDU accounts are controlled by teacher/class.
    if (user.userMode && user.userMode !== "PERSONAL") return;
    if (user.studentId) return;

    const forceOpen = hasDebugForceOpen();
    const done = Boolean(user.placementDone);
    if (forceOpen) {
      const timer = setTimeout(() => setOpen(true), 120);
      return () => clearTimeout(timer);
    }
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 350);
      return () => clearTimeout(timer);
    }
  }, [user?.id, user?.userMode, user?.studentId, user?.placementDone]);

  useEffect(() => {
    if (!user) return;
    if (user.userMode && user.userMode !== "PERSONAL") return;
    if (user.studentId) return;
    if (user.placementDone) return;

    const openPlacement = () => setOpen(true);
    window.addEventListener("studycod:open-placement", openPlacement);
    return () => window.removeEventListener("studycod:open-placement", openPlacement);
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
