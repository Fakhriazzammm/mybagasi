import { Outlet, Link } from "react-router-dom";
import { ShieldCheck, LayoutDashboard, Users, Crown, Store, Brain, User, LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "./SuperAdminSidebar";
import { BottomNav } from "@/components/site/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const superNav = [
  { to: "/super-admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/super-admin/users", label: "Users", icon: Users },
  { to: "/super-admin/plans", label: "Plans", icon: Crown },
  { to: "/super-admin/marketplaces", label: "Market", icon: Store },
  { to: "/super-admin/ai", label: "AI", icon: Brain },
];

export const SuperAdminLayout = () => {
  const { profile, signOut } = useAuth();
  const name = profile?.name || "Super Admin";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "SA";
  const email = profile?.email || "";

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <SuperAdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-16 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
            <SidebarTrigger />
            <div className="flex-1" />
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold bg-success/15 text-success px-3 py-1.5 rounded-full">
              <ShieldCheck className="h-3.5 w-3.5" />System healthy
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1 hover:bg-secondary/50 rounded-full px-2 py-1 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-foreground text-background grid place-items-center font-bold text-sm">
                    {initials}
                  </div>
                  <div className="hidden sm:block leading-tight text-left">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-[11px] text-muted-foreground">{email}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" /> Profil Saya
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-red-500 cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 max-w-[1400px] w-full mx-auto">
            <Outlet />
          </main>
          <BottomNav items={superNav} />
        </div>
      </div>
    </SidebarProvider>
  );
};
