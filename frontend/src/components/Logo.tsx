interface LogoProps {
  size?: number;
  className?: string;
}
export const Logo = ({
  size = 24,
  className = ""
}: LogoProps) => {
  return <svg width={size} height={size} viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 35 20 C 27 20 24 25 24 34 V 41 C 24 47 21 50 17 50 C 21 50 24 53 24 59 V 66 C 24 75 27 80 35 80" stroke="#68efb0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <path d="M 65 20 C 73 20 76 25 76 34 V 41 C 76 47 79 50 83 50 C 79 50 76 53 76 59 V 66 C 76 75 73 80 65 80" stroke="#68efb0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />

        <path d="M 45 73 L 55 27 M 55 27 L 50 32 M 55 27 L 58 34" stroke="#ffb454" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>;
};
export default Logo;
