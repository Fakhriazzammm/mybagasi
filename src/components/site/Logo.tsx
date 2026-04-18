import { Link } from "react-router-dom";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2 group ${className}`}>
    <div className="relative h-9 w-9 rounded-2xl bg-gradient-coral shadow-soft grid place-items-center text-primary-foreground font-display font-bold text-lg">
      <span className="leading-none">M</span>
      <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-accent border-2 border-background" />
    </div>
    <div className="flex flex-col leading-none">
      <span className="font-display font-bold text-lg tracking-tight">MyBagasi</span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Japan → ID</span>
    </div>
  </Link>
);
