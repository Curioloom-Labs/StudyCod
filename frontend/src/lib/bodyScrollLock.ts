let activeLocks = 0;
let previousOverflow = "";

/** Lock page scrolling until every open overlay releases its own lock. */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => undefined;

  if (activeLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  activeLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = "";
    }
  };
}
