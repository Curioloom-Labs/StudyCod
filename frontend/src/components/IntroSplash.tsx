import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Volume2, VolumeX, SkipForward } from "lucide-react";

const SEEN_KEY = "studycod.introSeen.v1";

interface IntroSplashProps {
  /** Path to the rendered intro video (served from /public). */
  src?: string;
  /** Called once the splash has fully dismissed. */
  onFinish?: () => void;
  /** Force-show even if already seen (e.g. a "replay intro" affordance). */
  force?: boolean;
}

/**
 * One-time cinematic brand intro shown on the first visit to the public landing
 * page. Autoplays muted (so browsers never block it), with an unmute control and
 * a skip button; dismisses with a soft fade and remembers it has been seen so
 * returning visitors are never interrupted.
 */
export const IntroSplash: React.FC<IntroSplashProps> = ({
  src = "/studycod-intro.mp4",
  onFinish,
  force = false,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [show, setShow] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Respect reduced-motion and the "already seen" flag.
    if (!force && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return force || !window.localStorage.getItem(SEEN_KEY);
  });
  const [muted, setMuted] = React.useState(true);

  const finish = React.useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore storage errors (private mode) */
    }
    setShow(false);
  }, []);

  React.useEffect(() => {
    if (!show) return;
    const video = videoRef.current;
    video?.play().catch(() => {
      /* autoplay may still be deferred; controls remain available */
    });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [show]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (!next) video.play().catch(() => {});
  };

  const btnClass =
    "inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-black/40 px-3 text-[11px] font-mono uppercase tracking-[0.12em] text-white/80 backdrop-blur-sm transition-fast hover:border-primary/60 hover:text-white focus:outline-none focus:ring-1 focus:ring-primary/60";

  return (
    <AnimatePresence onExitComplete={onFinish}>
      {show && (
        <motion.div
          key="intro-splash"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: "easeInOut" }}
        >
          <video
            ref={videoRef}
            src={src}
            autoPlay
            muted={muted}
            playsInline
            onEnded={finish}
            className="h-full w-full object-cover"
          />

          {/* Controls */}
          <div className="absolute bottom-6 right-6 flex items-center gap-3">
            <button type="button" onClick={toggleSound} className={btnClass}>
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {muted ? "Звук" : "Без звуку"}
            </button>
            <button type="button" onClick={finish} className={btnClass}>
              <SkipForward className="h-3.5 w-3.5" />
              Пропустити
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IntroSplash;
