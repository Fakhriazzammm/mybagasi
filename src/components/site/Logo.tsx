import { Link } from "react-router-dom";
import logoImg from "@/assets/mybagasi-logo.png";

export const Logo = ({ className = "", showText = true }: { className?: string; showText?: boolean }) => (
  <Link to="/" className={`flex items-center gap-2 group ${className}`}>
    <img
      src={logoImg}
      alt="MyBagasi"
      width={40}
      height={40}
      className="h-10 w-10 object-contain"
    />
    {showText && (
      <span className="font-display font-bold text-lg tracking-tight hidden sm:inline">
        My<span className="text-primary">Bagasi</span>
      </span>
    )}
  </Link>
);
