import { Outlet, Link } from "react-router-dom";
import { Bell, Search, LayoutDashboard, Calendar, BadgePercent, MessageSquare, User, Wallet, LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ShopperSidebar } from "./ShopperSidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/site/BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

const shopperNav = [
  { to: "/shopper", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/shopper/jadwal", label: "Jadwal", icon: Calendar },
  { to: "/shopper/ulasan", label: "Ulasan", icon: MessageSquare },
  { to: "/shopper/rate", label: "Rate Jasa", icon: BadgePercent },
  { to: "/shopper/profil", label: "Profil", icon: User },
  { to: "/shopper/keuangan", label: "Keuangan", icon: Wallet },
];

export const ShopperLayout = () => {
  const { profile, signOut } = useAuth();
  const name = profile?.name || "Shopper";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "SH";
  const email = profile?.email || "";

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-background">
        <ShopperSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-16 flex items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6">
            <SidebarTrigger />
            <div className="hidden md:flex items-center gap-2 max-w-md flex-1 ml-2">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Cari order, customer, atau shopper…" className="pl-9 h-10 rounded-full bg-secondary/60 border-border/60" />
              </div>
            </div>
            <div className="flex-1 md:hidden" />
            <button className="rounded-full h-10 w-10 grid place-items-center hover:bg-secondary relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 border-l border-border/60 ml-1 hover:bg-secondary/50 rounded-full px-2 py-1 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-gradient-coral text-primary-foreground grid place-items-center font-bold text-sm">
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
          <BottomNav items={shopperNav} />
        </div>
      </div>
    </SidebarProvider>
  );
};
