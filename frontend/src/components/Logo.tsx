interface LogoProps {
  size?: number;
  className?: string;
}
export const Logo = ({
  size = 24,
  className = ""
}: LogoProps) => {
  return <svg width={size} height={size} viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20 20 Q 15 30 15 40 Q 15 50 20 60 Q 25 70 20 80" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <path d="M 80 20 Q 85 30 85 40 Q 85 50 80 60 Q 75 70 80 80" stroke="#00ff88" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <line x1="55" y1="25" x2="45" y2="75" stroke="#ff8c00" strokeWidth="4" strokeLinecap="round" />
      </svg>;
};
export default Logo;