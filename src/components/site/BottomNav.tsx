import { NavLink, useLocation } from "react-router-dom";
import { LucideIcon } from "lucide-react";

export type BottomNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

interface BottomNavProps {
  items: BottomNavItem[];
}

export const BottomNav = ({ items }: BottomNavProps) => {
  const { pathname } = useLocation();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/60 pb-[env(safe-area-inset-bottom)]"
      aria-label="Bottom navigation"
    >
      <ul className="grid grid-cols-5">
        {items.slice(0, 5).map((item) => {
          const active = item.end
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`grid place-items-center h-8 w-8 rounded-2xl transition-colors ${
                    active ? "bg-primary-soft" : ""
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="leading-none truncate max-w-[64px]">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
