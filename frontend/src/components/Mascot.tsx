export const mascotVariants = [
  "happy",
  "wave",
  "focus",
  "confused",
  "victory",
  "tired",
  "wink",
  "surprised",
  "eureka",
  "facepalm",
  "proud",
  "encourage",
] as const;

export type MascotVariant = (typeof mascotVariants)[number];

type MascotProps = {
  variant?: MascotVariant;
  alt?: string;
  className?: string;
  size?: number | string;
  animated?: boolean;
};

export function Mascot({
  variant = "happy",
  alt = "",
  className = "",
  size,
}: MascotProps) {
  const src = `/assets/mascot/${variant}.png`;

  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={typeof size === "number" ? size : undefined}
      height={typeof size === "number" ? size : undefined}
      className={`block object-contain ${className}`}
      style={typeof size === "string" ? { width: size, height: size } : undefined}
    />
  );
}

export default Mascot;
